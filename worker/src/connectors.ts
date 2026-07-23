import type { D1Database } from '@cloudflare/workers-types';
import { cacheToken, getCachedToken, type Settings } from './settings';

/**
 * Source connectors, rebuilt from first principles.
 *
 * Design:
 *  1. IDENTITY FIRST — Pumble returns author IDs, not names. We resolve the
 *     full workspace directory once (cached 24h in D1), map every message to
 *     a human name, expand <@mention> tokens, and know who *you* are so we
 *     can detect messages aimed at you.
 *  2. CONTEXT ATTACHED — every item carries its channel/DM, sender name,
 *     and timestamps, so downstream (LLM, graph, UI) never sees bare IDs.
 *  3. ATTENTION ENGINE (zero-LLM) — deterministic heuristics flag what
 *     plausibly needs the operator: DMs, @mentions, direct questions,
 *     urgency keywords, VIP senders. The LLM refines; it doesn't discover.
 *  4. Everything is still plain HTTP — zero credits until the single
 *     triage call.
 */

export interface SourceItem {
  source: 'pumble' | 'gmail' | 'zoho';
  ref: string;
  channel: string; // "#general", "DM", "Inbox"
  from: string; // resolved human name
  fromId?: string;
  title: string;
  text: string;
  ts: string;
  isDm: boolean;
  mentionsMe: boolean;
  needsAttention: boolean;
  attentionReason?: string;
}

export interface SourceResult {
  source: 'pumble' | 'gmail' | 'zoho';
  ok: boolean;
  configured: boolean;
  error?: string;
  items: SourceItem[];
}

export interface PersonRecord {
  source: string;
  extId: string;
  name: string;
  email?: string;
  title?: string;
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

// ---------------------------------------------------------------------------
// ATTENTION ENGINE — deterministic, zero-credit triage hints
// ---------------------------------------------------------------------------

const URGENT_RE = /\b(urgent|asap|blocker|blocked|deadline|today|eod|critical|emergency|important|overdue|reminder)\b/i;
const ASK_RE = /\b(can you|could you|please|need you|waiting on|thoughts\?|approve|review|sign.?off|confirm|wdyt|what do you think|any update|follow(ing)? up)\b/i;

export function scoreAttention(item: Omit<SourceItem, 'needsAttention' | 'attentionReason'>): {
  needsAttention: boolean;
  attentionReason?: string;
} {
  const reasons: string[] = [];
  if (item.isDm) reasons.push('direct message');
  if (item.mentionsMe) reasons.push('mentions you');
  const text = `${item.title} ${item.text}`;
  if (URGENT_RE.test(text)) reasons.push('urgency language');
  if (ASK_RE.test(text)) reasons.push('direct ask');
  else if (item.text.includes('?') && (item.isDm || item.mentionsMe)) reasons.push('question to you');
  return reasons.length
    ? { needsAttention: true, attentionReason: reasons.slice(0, 2).join(' + ') }
    : { needsAttention: false };
}

// ---------------------------------------------------------------------------
// PUMBLE — API Keys addon, with full identity resolution
// ---------------------------------------------------------------------------

const PUMBLE_BASE = 'https://pumble-api-keys.addons.marketplace.cake.com';

async function pumbleGet(key: string, path: string): Promise<any> {
  const res = await fetch(`${PUMBLE_BASE}${path}`, { headers: { 'Api-Key': key } });
  if (!res.ok) throw new Error(`Pumble ${path.split('?')[0]} failed (${res.status})`);
  return safeJson(res);
}

interface PumbleDirectory {
  me: { id: string; name: string };
  users: Map<string, { name: string; email?: string; title?: string }>;
}

function pumbleUserName(u: any): string {
  return (
    u?.profile?.fullName || u?.fullName || u?.profile?.displayName || u?.displayName || u?.name || u?.username || u?.email?.split('@')[0] || 'teammate'
  );
}

/** Resolve the workspace directory (users + self), cached 24h in D1. */
async function pumbleDirectory(db: D1Database, key: string): Promise<PumbleDirectory> {
  const cached = await getCachedToken(db, 'pumble_dir');
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { me: { id: string; name: string }; users: [string, { name: string; email?: string; title?: string }][] };
      return { me: parsed.me, users: new Map(parsed.users) };
    } catch {
      /* refetch */
    }
  }
  const [meRaw, usersRaw] = await Promise.all([pumbleGet(key, '/myInfo'), pumbleGet(key, '/listUsers')]);
  const meObj = meRaw?.user ?? meRaw;
  const me = { id: String(meObj?.id ?? ''), name: pumbleUserName(meObj) };
  const list: any[] = Array.isArray(usersRaw) ? usersRaw : usersRaw?.users ?? [];
  const users = new Map<string, { name: string; email?: string; title?: string }>();
  for (const raw of list) {
    const u = raw?.user ?? raw;
    const id = String(u?.id ?? '');
    if (!id) continue;
    users.set(id, { name: pumbleUserName(u), email: u?.email, title: u?.profile?.title ?? u?.title });
  }
  await cacheToken(db, 'pumble_dir', JSON.stringify({ me, users: [...users.entries()] }), 86400);
  return { me, users };
}

/** Expand Pumble mention tokens like <@USERID> into @Name; detect self-mentions. */
function expandMentions(text: string, dir: PumbleDirectory): { text: string; mentionsMe: boolean } {
  let mentionsMe = false;
  const out = text.replace(/<@([A-Za-z0-9_-]+)>|@([A-Za-z0-9]{16,})/g, (_, g1, g2) => {
    const id = g1 || g2;
    if (id === dir.me.id) {
      mentionsMe = true;
      return `@${dir.me.name} (you)`;
    }
    const u = dir.users.get(id);
    return u ? `@${u.name}` : '@teammate';
  });
  return { text: out, mentionsMe };
}

export async function fetchPumble(
  db: D1Database,
  s: Settings,
  perChannel = 8,
  maxChannels = 8,
): Promise<{ result: SourceResult; people: PersonRecord[] }> {
  const key = s.PUMBLE_API_KEY;
  if (!key) return { result: { source: 'pumble', ok: false, configured: false, items: [] }, people: [] };
  try {
    const dir = await pumbleDirectory(db, key);
    const channelsRaw = await pumbleGet(key, '/listChannels');
    const all: any[] = Array.isArray(channelsRaw) ? channelsRaw : channelsRaw?.channels ?? [];
    const chans = all.map((c: any) => c?.channel ?? c).filter((c: any) => c && (c.id || c.name));

    const wanted = (s.PUMBLE_CHANNELS ?? '')
      .split(',')
      .map((c) => c.trim().replace(/^#/, '').toLowerCase())
      .filter(Boolean);

    const isDmChan = (c: any) => (c.channelType ?? c.type) === 'DIRECT';
    // DMs are always high-signal: scan them plus the wanted/public channels.
    const dms = chans.filter(isDmChan).slice(0, 6);
    let publics = wanted.length
      ? chans.filter((c: any) => wanted.includes(String(c.name ?? '').toLowerCase()))
      : chans.filter((c: any) => !isDmChan(c));
    publics = publics.slice(0, maxChannels);
    const scan = [...dms, ...publics];

    const items: SourceItem[] = [];
    const results = await Promise.allSettled(
      scan.map(async (c: any) => {
        const id = c.id ?? c.channelId;
        const isDm = isDmChan(c);
        const q = id ? `channelId=${encodeURIComponent(id)}` : `channel=${encodeURIComponent(c.name)}`;
        const data = await pumbleGet(key, `/listMessages?${q}&limit=${perChannel}`);
        const msgs: any[] = Array.isArray(data) ? data : data?.messages ?? [];
        for (const m of msgs) {
          const msg = m?.message ?? m;
          const rawText = strip(String(msg.text ?? msg.blocksText ?? ''));
          if (!rawText) continue;
          const authorId = String(msg.author ?? msg.authorId ?? msg.userId ?? '');
          if (authorId && authorId === dir.me.id) continue; // skip your own messages
          const author = dir.users.get(authorId);
          const from = author?.name ?? (authorId ? clip(authorId, 12) : 'teammate');
          const { text, mentionsMe } = expandMentions(rawText, dir);
          // DM channel label: the other person's name beats a raw id
          const channelLabel = isDm ? `DM · ${from}` : `#${c.name ?? 'channel'}`;
          const rawTs = msg.timestamp ?? msg.createdAt ?? '';
          let ts = '';
          if (rawTs) {
            const d = new Date(typeof rawTs === 'number' || /^\d+$/.test(String(rawTs)) ? Number(rawTs) : String(rawTs));
            ts = isNaN(d.getTime()) ? String(rawTs) : d.toISOString();
          }
          const base = {
            source: 'pumble' as const,
            ref: String(msg.id ?? ''),
            channel: channelLabel,
            from,
            fromId: authorId || undefined,
            title: channelLabel,
            text: clip(text, 280),
            ts,
            isDm,
            mentionsMe,
          };
          items.push({ ...base, ...scoreAttention(base) });
        }
      }),
    );
    const failures = results.filter((r) => r.status === 'rejected').length;

    const people: PersonRecord[] = [...dir.users.entries()].map(([extId, u]) => ({
      source: 'pumble',
      extId,
      name: u.name,
      email: u.email,
      title: u.title,
    }));

    return {
      result: {
        source: 'pumble',
        ok: failures < scan.length || scan.length === 0,
        configured: true,
        error: failures ? `${failures}/${scan.length} channels failed` : undefined,
        items,
      },
      people,
    };
  } catch (e) {
    return { result: { source: 'pumble', ok: false, configured: true, error: (e as Error).message, items: [] }, people: [] };
  }
}

// ---------------------------------------------------------------------------
// GMAIL
// ---------------------------------------------------------------------------

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

/** "Jane Doe <jane@x.com>" → { name, email } */
function parseAddress(raw: string): { name: string; email?: string } {
  const m = raw.match(/^"?([^"<]+?)"?\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  const email = raw.trim().toLowerCase();
  if (email.includes('@')) return { name: email.split('@')[0], email };
  return { name: raw.trim() || 'unknown' };
}

export async function fetchGmail(
  db: D1Database,
  s: Settings,
  max = 12,
): Promise<{ result: SourceResult; people: PersonRecord[] }> {
  if (!s.GMAIL_CLIENT_ID || !s.GMAIL_CLIENT_SECRET || !s.GMAIL_REFRESH_TOKEN) {
    return { result: { source: 'gmail', ok: false, configured: false, items: [] }, people: [] };
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
    const people = new Map<string, PersonRecord>();

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
        const addr = parseAddress(strip(h('from')));
        if (addr.email) people.set(addr.email, { source: 'gmail', extId: addr.email, name: addr.name, email: addr.email });
        const base = {
          source: 'gmail' as const,
          ref: id,
          channel: 'Inbox',
          from: addr.name,
          fromId: addr.email,
          title: clip(strip(h('subject')) || '(no subject)', 140),
          text: clip(strip(String(m.snippet ?? '')), 240),
          ts: h('date'),
          isDm: true, // email to you is inherently direct
          mentionsMe: false,
        };
        return { ...base, ...scoreAttention(base) };
      }),
    );
    return {
      result: { source: 'gmail', ok: true, configured: true, items: items.filter((i): i is SourceItem => !!i) },
      people: [...people.values()],
    };
  } catch (e) {
    return { result: { source: 'gmail', ok: false, configured: true, error: (e as Error).message, items: [] }, people: [] };
  }
}

// ---------------------------------------------------------------------------
// ZOHO MAIL
// ---------------------------------------------------------------------------

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
  const cached = await getCachedToken(db, 'zoho_account');
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

export async function fetchZoho(
  db: D1Database,
  s: Settings,
  max = 12,
): Promise<{ result: SourceResult; people: PersonRecord[] }> {
  if (!s.ZOHO_CLIENT_ID || !s.ZOHO_CLIENT_SECRET || !s.ZOHO_REFRESH_TOKEN) {
    return { result: { source: 'zoho', ok: false, configured: false, items: [] }, people: [] };
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
    const people = new Map<string, PersonRecord>();
    const items: SourceItem[] = (json.data ?? []).map((m: any) => {
      const addr = parseAddress(strip(String(m.sender ?? m.fromAddress ?? '')));
      if (addr.email) people.set(addr.email, { source: 'zoho', extId: addr.email, name: addr.name, email: addr.email });
      const base = {
        source: 'zoho' as const,
        ref: String(m.messageId ?? ''),
        channel: 'Company inbox',
        from: addr.name,
        fromId: addr.email,
        title: clip(strip(String(m.subject ?? '(no subject)')), 140),
        text: clip(strip(String(m.summary ?? '')), 240),
        ts: m.receivedTime ? new Date(Number(m.receivedTime)).toISOString() : '',
        isDm: true,
        mentionsMe: false,
      };
      return { ...base, ...scoreAttention(base) };
    });
    return { result: { source: 'zoho', ok: true, configured: true, items }, people: [...people.values()] };
  } catch (e) {
    return { result: { source: 'zoho', ok: false, configured: true, error: (e as Error).message, items: [] }, people: [] };
  }
}

// ---------------------------------------------------------------------------
// One parallel pass + durable persistence
// ---------------------------------------------------------------------------

export async function fetchAllSources(
  db: D1Database,
  s: Settings,
): Promise<{ results: SourceResult[]; people: PersonRecord[] }> {
  const [p, g, z] = await Promise.all([fetchPumble(db, s), fetchGmail(db, s), fetchZoho(db, s)]);
  return { results: [p.result, g.result, z.result], people: [...p.people, ...g.people, ...z.people] };
}

/** Upsert people + items into the durable layer. Batched, cheap. */
export async function persistPass(db: D1Database, results: SourceResult[], people: PersonRecord[]): Promise<void> {
  const now = Date.now();
  const stmts = [];
  for (const p of people.slice(0, 200)) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO people (source, ext_id, name, email, title, last_seen) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(source, ext_id) DO UPDATE SET name = excluded.name, email = COALESCE(excluded.email, people.email), title = COALESCE(excluded.title, people.title), last_seen = excluded.last_seen`,
        )
        .bind(p.source, p.extId, p.name, p.email ?? null, p.title ?? null, now),
    );
  }
  for (const r of results) {
    for (const it of r.items) {
      if (!it.ref) continue;
      stmts.push(
        db
          .prepare(
            `INSERT INTO items (source, ref, channel, from_name, from_id, title, text, ts, is_dm, mentions_me, needs_attention, attention_reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(source, ref) DO UPDATE SET needs_attention = excluded.needs_attention, attention_reason = excluded.attention_reason`,
          )
          .bind(
            it.source, it.ref, it.channel, it.from, it.fromId ?? null, it.title, it.text, it.ts || null,
            it.isDm ? 1 : 0, it.mentionsMe ? 1 : 0, it.needsAttention ? 1 : 0, it.attentionReason ?? null, now,
          ),
      );
    }
  }
  // chunk batches — D1 batch limit safety
  for (let i = 0; i < stmts.length; i += 50) {
    await db.batch(stmts.slice(i, i + 50));
  }
}

/** Compact, token-efficient digest for the single LLM pass, attention items first. */
export function digestForPrompt(results: SourceResult[], maxItems = 40): string {
  const lines: string[] = [];
  let i = 0;
  const ordered = results.map((r) => ({
    ...r,
    items: [...r.items].sort((a, b) => Number(b.needsAttention) - Number(a.needsAttention)),
  }));
  for (const r of ordered) {
    if (!r.configured) continue;
    lines.push(`## ${r.source.toUpperCase()} — ${r.ok ? `${r.items.length} items` : `ERROR: ${r.error}`}`);
    for (const item of r.items) {
      if (i >= maxItems) break;
      i++;
      const flags = [item.isDm ? 'DM' : '', item.mentionsMe ? 'MENTIONS-YOU' : '', item.needsAttention ? `ATTN(${item.attentionReason})` : '']
        .filter(Boolean)
        .join(' ');
      lines.push(`[${item.source}:${i}] ${item.channel} | from ${item.from}${item.ts ? ` | ${item.ts}` : ''}${flags ? ` | ${flags}` : ''}\n  ${item.title !== item.channel ? `${item.title}: ` : ''}${item.text}`);
    }
  }
  return lines.join('\n');
}
