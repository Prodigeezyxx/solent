import type { D1Database } from '@cloudflare/workers-types';
import { cacheToken, getCachedToken, type Settings } from './settings';

/**
 * Source connectors: Pumble (work chat), Gmail, Zoho Mail (company mail).
 * All fetches are plain HTTP — zero LLM credits. Everything is gathered in
 * one parallel pass and condensed before a single model call.
 */

export interface SourceItem {
  source: 'pumble' | 'gmail' | 'zoho';
  ref: string; // stable id within the source
  from: string;
  title: string; // channel or subject
  text: string; // trimmed body/snippet
  ts: string; // ISO-ish timestamp when known
}

export interface SourceResult {
  source: 'pumble' | 'gmail' | 'zoho';
  ok: boolean;
  configured: boolean;
  error?: string;
  items: SourceItem[];
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const strip = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${clip(text, 120)}`);
  }
}

// --------------------------------------------------------------------------
// PUMBLE — via the official "API Keys" addon (header: Api-Key)
// https://pumble-api-keys.addons.marketplace.cake.com
// --------------------------------------------------------------------------

const PUMBLE_BASE = 'https://pumble-api-keys.addons.marketplace.cake.com';

async function pumbleGet(key: string, path: string): Promise<any> {
  const res = await fetch(`${PUMBLE_BASE}${path}`, { headers: { 'Api-Key': key } });
  if (!res.ok) throw new Error(`Pumble ${path} failed (${res.status})`);
  return safeJson(res);
}

export async function fetchPumble(s: Settings, perChannel = 8, maxChannels = 6): Promise<SourceResult> {
  const key = s.PUMBLE_API_KEY;
  if (!key) return { source: 'pumble', ok: false, configured: false, items: [] };
  try {
    const channelsRaw = await pumbleGet(key, '/listChannels');
    const all: any[] = Array.isArray(channelsRaw) ? channelsRaw : channelsRaw?.channels ?? [];
    // Normalise: entries can be {channel:{...}} or flat
    const chans = all
      .map((c: any) => c?.channel ?? c)
      .filter((c: any) => c && (c.id || c.name));

    const wanted = (s.PUMBLE_CHANNELS ?? '')
      .split(',')
      .map((c) => c.trim().replace(/^#/, '').toLowerCase())
      .filter(Boolean);

    let scan = wanted.length
      ? chans.filter((c: any) => wanted.includes(String(c.name ?? '').toLowerCase()))
      : chans.filter((c: any) => (c.channelType ?? c.type) !== 'DIRECT');
    scan = scan.slice(0, maxChannels);

    const items: SourceItem[] = [];
    const results = await Promise.allSettled(
      scan.map(async (c: any) => {
        const id = c.id ?? c.channelId;
        const q = id ? `channelId=${encodeURIComponent(id)}` : `channel=${encodeURIComponent(c.name)}`;
        const data = await pumbleGet(key, `/listMessages?${q}&limit=${perChannel}`);
        const msgs: any[] = Array.isArray(data) ? data : data?.messages ?? [];
        for (const m of msgs) {
          const msg = m?.message ?? m;
          const text = strip(String(msg.text ?? msg.blocksText ?? ''));
          if (!text) continue;
          items.push({
            source: 'pumble',
            ref: String(msg.id ?? ''),
            from: String(msg.authorName ?? msg.author ?? 'teammate'),
            title: `#${c.name ?? 'channel'}`,
            text: clip(text, 280),
            ts: String(msg.timestamp ?? msg.createdAt ?? ''),
          });
        }
      }),
    );
    const failures = results.filter((r) => r.status === 'rejected').length;
    return {
      source: 'pumble',
      ok: failures < scan.length || scan.length === 0,
      configured: true,
      error: failures ? `${failures}/${scan.length} channels failed` : undefined,
      items,
    };
  } catch (e) {
    return { source: 'pumble', ok: false, configured: true, error: (e as Error).message, items: [] };
  }
}

// --------------------------------------------------------------------------
// GMAIL — OAuth2 refresh-token flow + REST API (metadata only, cheap)
// --------------------------------------------------------------------------

async function gmailAccessToken(db: D1Database, s: Settings): Promise<string> {
  const cached = await getCachedToken(db, 'gmail');
  if (cached) return cached;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: s.GMAIL_CLIENT_ID!,
      client_secret: s.GMAIL_CLIENT_SECRET!,
      refresh_token: s.GMAIL_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });
  const json = await safeJson(res);
  if (!res.ok || !json.access_token) throw new Error(`Gmail token refresh failed: ${json.error ?? res.status}`);
  await cacheToken(db, 'gmail', json.access_token, Number(json.expires_in ?? 3600));
  return json.access_token as string;
}

export async function fetchGmail(db: D1Database, s: Settings, max = 12): Promise<SourceResult> {
  if (!s.GMAIL_CLIENT_ID || !s.GMAIL_CLIENT_SECRET || !s.GMAIL_REFRESH_TOKEN) {
    return { source: 'gmail', ok: false, configured: false, items: [] };
  }
  try {
    const token = await gmailAccessToken(db, s);
    const auth = { Authorization: `Bearer ${token}` };
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent('in:inbox newer_than:2d -category:promotions -category:social')}&maxResults=${max}`,
      { headers: auth },
    );
    const list = await safeJson(listRes);
    if (!listRes.ok) throw new Error(`Gmail list failed: ${list.error?.message ?? listRes.status}`);
    const ids: string[] = (list.messages ?? []).map((m: any) => m.id);

    const items = await Promise.all(
      ids.map(async (id): Promise<SourceItem | null> => {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: auth },
        );
        if (!r.ok) return null;
        const m = await safeJson(r);
        const h = (name: string) =>
          (m.payload?.headers ?? []).find((x: any) => x.name?.toLowerCase() === name)?.value ?? '';
        return {
          source: 'gmail',
          ref: id,
          from: strip(h('from')),
          title: clip(strip(h('subject')) || '(no subject)', 140),
          text: clip(strip(String(m.snippet ?? '')), 240),
          ts: h('date'),
        };
      }),
    );
    return { source: 'gmail', ok: true, configured: true, items: items.filter((i): i is SourceItem => !!i) };
  } catch (e) {
    return { source: 'gmail', ok: false, configured: true, error: (e as Error).message, items: [] };
  }
}

// --------------------------------------------------------------------------
// ZOHO MAIL — OAuth2 refresh-token flow + Mail REST API
// --------------------------------------------------------------------------

function zohoDc(s: Settings): string {
  return (s.ZOHO_DC ?? 'com').replace(/^\./, '');
}

async function zohoAccessToken(db: D1Database, s: Settings): Promise<string> {
  const cached = await getCachedToken(db, 'zoho');
  if (cached) return cached;
  const res = await fetch(`https://accounts.zoho.${zohoDc(s)}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: s.ZOHO_CLIENT_ID!,
      client_secret: s.ZOHO_CLIENT_SECRET!,
      refresh_token: s.ZOHO_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });
  const json = await safeJson(res);
  if (!res.ok || !json.access_token) throw new Error(`Zoho token refresh failed: ${json.error ?? res.status}`);
  await cacheToken(db, 'zoho', json.access_token, Number(json.expires_in ?? 3600));
  return json.access_token as string;
}

async function zohoAccountId(db: D1Database, s: Settings, token: string): Promise<string> {
  if (s.ZOHO_ACCOUNT_ID) return s.ZOHO_ACCOUNT_ID;
  const cached = await getCachedToken(db, 'zoho_account'); // reuse token cache as a tiny KV
  if (cached) return cached;
  const res = await fetch(`https://mail.zoho.${zohoDc(s)}/api/accounts`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  const json = await safeJson(res);
  if (!res.ok) throw new Error(`Zoho accounts failed: ${json.data?.errorCode ?? res.status}`);
  const id = String(json.data?.[0]?.accountId ?? '');
  if (!id) throw new Error('No Zoho mail account found for this token');
  await cacheToken(db, 'zoho_account', id, 86400 * 30);
  return id;
}

export async function fetchZoho(db: D1Database, s: Settings, max = 12): Promise<SourceResult> {
  if (!s.ZOHO_CLIENT_ID || !s.ZOHO_CLIENT_SECRET || !s.ZOHO_REFRESH_TOKEN) {
    return { source: 'zoho', ok: false, configured: false, items: [] };
  }
  try {
    const token = await zohoAccessToken(db, s);
    const accountId = await zohoAccountId(db, s, token);
    const res = await fetch(
      `https://mail.zoho.${zohoDc(s)}/api/accounts/${accountId}/messages/view?limit=${max}&sortorder=false`,
      { headers: { Authorization: `Zoho-oauthtoken ${token}` } },
    );
    const json = await safeJson(res);
    if (!res.ok) throw new Error(`Zoho messages failed: ${json.data?.errorCode ?? res.status}`);
    const items: SourceItem[] = (json.data ?? []).map((m: any) => ({
      source: 'zoho' as const,
      ref: String(m.messageId ?? ''),
      from: strip(String(m.sender ?? m.fromAddress ?? '')),
      title: clip(strip(String(m.subject ?? '(no subject)')), 140),
      text: clip(strip(String(m.summary ?? '')), 240),
      ts: m.receivedTime ? new Date(Number(m.receivedTime)).toISOString() : '',
    }));
    return { source: 'zoho', ok: true, configured: true, items };
  } catch (e) {
    return { source: 'zoho', ok: false, configured: true, error: (e as Error).message, items: [] };
  }
}

// --------------------------------------------------------------------------
// One parallel pass over every configured source.
// --------------------------------------------------------------------------

export async function fetchAllSources(db: D1Database, s: Settings): Promise<SourceResult[]> {
  return Promise.all([fetchPumble(s), fetchGmail(db, s), fetchZoho(db, s)]);
}

/** Compact, token-efficient digest for the single LLM pass. */
export function digestForPrompt(results: SourceResult[], maxItems = 40): string {
  const lines: string[] = [];
  let i = 0;
  for (const r of results) {
    if (!r.configured) continue;
    lines.push(`## ${r.source.toUpperCase()} — ${r.ok ? `${r.items.length} items` : `ERROR: ${r.error}`}`);
    for (const item of r.items) {
      if (i >= maxItems) break;
      i++;
      lines.push(`[${item.source}:${i}] ${item.title} | from ${item.from}${item.ts ? ` | ${item.ts}` : ''}\n  ${item.text}`);
    }
  }
  return lines.join('\n');
}
