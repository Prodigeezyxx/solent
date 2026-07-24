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

export type SourceName = 'pumble' | 'gmail' | 'zoho' | 'gcal';

export interface SourceItem {
  source: SourceName;
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
  source: SourceName;
  ok: boolean;
  configured: boolean;
  error?: string;
  items: SourceItem[];
  /** Asks the OPERATOR made that are plausibly awaiting a reply (outbound open loops). */
  outbound?: OutboundAsk[];
}

export interface OutboundAsk {
  source: SourceName;
  ref: string;
  channel: string;
  counterparty: string;
  counterpartyId?: string;
  ask: string;
  ts: string;
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
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
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

// Marketing/newsletter detection — mass mail never "needs you" no matter how
// urgent its copy sounds ("Don't miss!", "deadline today!").
const MARKETING_ADDR_RE = /(no.?reply|noreply|newsletter|marketing|notifications?@|updates?@|news@|digest|mailer|campaigns?@|hello@|promo|billing@|do.?not.?reply)/i;
const MARKETING_TEXT_RE = /\b(unsubscribe|view (this|in) browser|manage preferences|webinar|early.?bird|limited time|don.?t miss|register now|% off|free trial)\b/i;

function isMassMail(item: { fromId?: string; from: string; title: string; text: string }): boolean {
  return (
    MARKETING_ADDR_RE.test(item.fromId ?? '') ||
    MARKETING_ADDR_RE.test(item.from) ||
    MARKETING_TEXT_RE.test(`${item.title} ${item.text}`)
  );
}

export function scoreAttention(
  item: Omit<SourceItem, 'needsAttention' | 'attentionReason'>,
  operatorName?: string,
): {
  needsAttention: boolean;
  attentionReason?: string;
} {
  const isEmail = item.source !== 'pumble';
  // Newsletters/marketing: never attention-worthy, regardless of copy.
  if (isEmail && isMassMail(item)) return { needsAttention: false };

  const text = `${item.title} ${item.text}`;
  const namedYou =
    !!operatorName?.trim() && new RegExp(`\\b${operatorName.trim().split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);

  const reasons: string[] = [];
  // "Direct message" is only meaningful in chat — every email is technically direct.
  if (item.isDm && !isEmail) reasons.push('direct message');
  if (item.mentionsMe) reasons.push('mentions you');
  if (namedYou && isEmail) reasons.push('addressed to you by name');
  if (URGENT_RE.test(text)) reasons.push('urgency language');
  if (ASK_RE.test(text)) reasons.push('direct ask');
  else if (text.includes('?')) {
    // A bare "?" only counts when it's plausibly aimed at YOU:
    // chat DM/mention, or an email that names you personally.
    if (!isEmail && (item.isDm || item.mentionsMe)) reasons.push('question to you');
    else if (isEmail && namedYou) reasons.push('question to you');
  }

  // Email needs a human reason (name/ask/question/urgency), not mere existence.
  if (isEmail && reasons.length === 0) return { needsAttention: false };
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
  perChannel = 12,
  maxChannels = 10,
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
    const outbound: OutboundAsk[] = [];
    const results = await Promise.allSettled(
      scan.map(async (c: any) => {
        const id = c.id ?? c.channelId;
        const isDm = isDmChan(c);
        const q = id ? `channelId=${encodeURIComponent(id)}` : `channel=${encodeURIComponent(c.name)}`;
        const data = await pumbleGet(key, `/listMessages?${q}&limit=${perChannel}`);
        const msgs: any[] = Array.isArray(data) ? data : data?.messages ?? [];

        // Two-pass: first learn who else talks in this channel (DM partner),
        // then process — so the operator's own asks get a counterparty name.
        const norm = msgs
          .map((m) => {
            const msg = m?.message ?? m;
            const rawText = strip(String(msg.text ?? msg.blocksText ?? ''));
            const authorId = String(msg.author ?? msg.authorId ?? msg.userId ?? '');
            const rawTs = msg.timestamp ?? msg.createdAt ?? '';
            let ts = '';
            if (rawTs) {
              const d = new Date(typeof rawTs === 'number' || /^\d+$/.test(String(rawTs)) ? Number(rawTs) : String(rawTs));
              ts = isNaN(d.getTime()) ? String(rawTs) : d.toISOString();
            }
            return { ref: String(msg.id ?? ''), rawText, authorId, ts };
          })
          .filter((m) => m.rawText);

        const partnerId = norm.find((m) => m.authorId && m.authorId !== dir.me.id)?.authorId;
        const partner = partnerId ? dir.users.get(partnerId)?.name ?? clip(partnerId, 12) : undefined;
        // Whether anyone replied after a given message index (loop-closing heuristic)
        const lastOtherTs = norm.filter((m) => m.authorId !== dir.me.id).map((m) => m.ts).sort().pop() ?? '';

        for (const m of norm) {
          const isMine = !!m.authorId && m.authorId === dir.me.id;
          const { text, mentionsMe } = expandMentions(m.rawText, dir);

          if (isMine) {
            // OUTBOUND LOOP: you asked something and nobody has replied since.
            const asked = ASK_RE.test(text) || text.includes('?');
            const unanswered = !lastOtherTs || (m.ts && m.ts > lastOtherTs);
            if (isDm && asked && unanswered && partner) {
              outbound.push({
                source: 'pumble',
                ref: m.ref,
                channel: `DM · ${partner}`,
                counterparty: partner,
                counterpartyId: partnerId,
                ask: clip(text, 200),
                ts: m.ts,
              });
            }
            continue; // own messages never enter the inbox
          }

          const author = dir.users.get(m.authorId);
          const from = author?.name ?? (m.authorId ? clip(m.authorId, 12) : 'teammate');
          const channelLabel = isDm ? `DM · ${from}` : `#${c.name ?? 'channel'}`;
          const base = {
            source: 'pumble' as const,
            ref: m.ref,
            channel: channelLabel,
            from,
            fromId: m.authorId || undefined,
            title: channelLabel,
            text: clip(text, 280),
            ts: m.ts,
            isDm,
            mentionsMe,
          };
          items.push({ ...base, ...scoreAttention(base, s.OPERATOR_NAME) });
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
        outbound,
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

/**
 * One Google access token serves BOTH Gmail and Calendar — the scopes live
 * on the refresh token, so a token minted with gmail.readonly +
 * calendar.readonly unlocks both APIs from the same credentials.
 */
async function googleAccessToken(db: D1Database, s: Settings): Promise<string> {
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

/** Decode entities WITHOUT stripping <angle brackets> — safe for address headers. */
const decodeHeader = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\s+/g, ' ')
    .trim();

/** "Jane Doe <jane@x.com>" → { name, email }. NEVER pre-strip() the input — it eats <addr>. */
function parseAddress(raw: string): { name: string; email?: string } {
  const cleaned = decodeHeader(raw);
  const m = cleaned.match(/^"?([^"<]+?)"?\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  const email = cleaned.trim().toLowerCase();
  if (email.includes('@')) return { name: prettifyLocalPart(email.split('@')[0]), email };
  return { name: cleaned.trim() || 'unknown' };
}

/** "jane.doe" / "jane_doe1" → "Jane Doe" — humane fallback when only an address exists. */
function prettifyLocalPart(local: string): string {
  const words = local.replace(/[\d]+$/g, '').split(/[._\-+]+/).filter(Boolean);
  if (!words.length) return local;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export async function fetchGmail(
  db: D1Database,
  s: Settings,
  max = 50,
): Promise<{ result: SourceResult; people: PersonRecord[] }> {
  if (!s.GMAIL_CLIENT_ID || !s.GMAIL_CLIENT_SECRET || !s.GMAIL_REFRESH_TOKEN) {
    return { result: { source: 'gmail', ok: false, configured: false, items: [] }, people: [] };
  }
  try {
    const token = await googleAccessToken(db, s);
    const auth = { Authorization: `Bearer ${token}` };
    // Lookback window: default 14 days, tunable via SOURCE_LOOKBACK_DAYS.
    // Older items already persisted in D1 stay; each pass extends the record.
    const lookback = Math.max(1, Math.min(60, Number(s.SOURCE_LOOKBACK_DAYS ?? 14)));

    /**
     * TRIPLE-QUERY COVERAGE. A busy inbox can hold hundreds of messages
     * inside the lookback window — a single recency-capped list silently
     * drops the older ones, which is exactly where week-old high-value
     * threads live (starred intros were dropped this way once).
     *   A) newest mail (recency) — the live pulse
     *   B) is:starred — the operator's OWN deliberate priority mark, tiny
     *      and pure; every starred message in the window ALWAYS gets a seat.
     *      (Kept separate from is:important, which Gmail sprays on bots/OTPs
     *      — combined, the junk crowded the stars out of the result cap.)
     *   C) is:important — Gmail's signal, small cap, better than nothing
     */
    const listQuery = async (q: string, n: number): Promise<string[]> => {
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${n}`,
        { headers: auth },
      );
      const j = await safeJson(r);
      if (!r.ok) throw new Error(`Gmail list failed: ${j.error?.message ?? r.status}`);
      return (j.messages ?? []).map((m: any) => String(m.id));
    };
    const [recentIds, starredIds, importantIds] = await Promise.all([
      listQuery(`in:inbox newer_than:${lookback}d -category:promotions -category:social`, max),
      listQuery(`in:inbox is:starred newer_than:${lookback}d`, 25),
      listQuery(`in:inbox is:important newer_than:${lookback}d -category:promotions -category:social -from:noreply -from:notifications`, 15),
    ]);
    const ids = [...new Set([...starredIds, ...recentIds, ...importantIds])];
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
        const addr = parseAddress(h('from'));
        if (addr.email) people.set(addr.email, { source: 'gmail', extId: addr.email, name: addr.name, email: addr.email });
        const labels: string[] = m.labelIds ?? [];
        const starred = labels.includes('STARRED');
        const important = labels.includes('IMPORTANT');
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
        const scored = scoreAttention(base, s.OPERATOR_NAME);
        // Gmail's own priority signals outrank our heuristics: starred mail
        // is a deliberate act by the operator — always attention-worthy.
        if (starred) {
          const reason = ['starred by you', scored.attentionReason].filter(Boolean).join(' + ');
          return { ...base, needsAttention: true, attentionReason: clip(reason, 60) };
        }
        if (important && scored.needsAttention) {
          return { ...base, needsAttention: true, attentionReason: clip(`gmail-important + ${scored.attentionReason}`, 60) };
        }
        return { ...base, ...scored };
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
  max = 30,
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
      // Zoho: `sender` is the display name, `fromAddress` the raw address.
      const senderName = decodeHeader(String(m.sender ?? ''));
      const fromAddr = String(m.fromAddress ?? '').trim().toLowerCase();
      const parsed = parseAddress(fromAddr || senderName);
      const addr = {
        name: senderName && !senderName.includes('@') ? senderName : parsed.name,
        email: parsed.email ?? (fromAddr.includes('@') ? fromAddr : undefined),
      };
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
      return { ...base, ...scoreAttention(base, s.OPERATOR_NAME) };
    });
    return { result: { source: 'zoho', ok: true, configured: true, items }, people: [...people.values()] };
  } catch (e) {
    return { result: { source: 'zoho', ok: false, configured: true, error: (e as Error).message, items: [] }, people: [] };
  }
}

// ---------------------------------------------------------------------------
// GOOGLE CALENDAR — same OAuth client as Gmail, needs calendar.readonly scope
// ---------------------------------------------------------------------------

/** "2026-07-24T14:00:00+01:00" → "Thu 14:00"; all-day dates → "Thu (all day)". */
function fmtEventTime(start?: { dateTime?: string; date?: string }, end?: { dateTime?: string; date?: string }): string {
  if (start?.dateTime) {
    const s = new Date(start.dateTime);
    const e = end?.dateTime ? new Date(end.dateTime) : null;
    const day = s.toUTCString().slice(0, 3);
    const hm = (d: Date) => d.toISOString().slice(11, 16);
    return e ? `${day} ${hm(s)}–${hm(e)} UTC` : `${day} ${hm(s)} UTC`;
  }
  if (start?.date) return `${new Date(`${start.date}T00:00:00Z`).toUTCString().slice(0, 3)} ${start.date} (all day)`;
  return '';
}

export async function fetchGcal(
  db: D1Database,
  s: Settings,
  max = 20,
): Promise<{ result: SourceResult; people: PersonRecord[] }> {
  // Reuses the Gmail OAuth client — configured whenever Gmail is.
  if (!s.GMAIL_CLIENT_ID || !s.GMAIL_CLIENT_SECRET || !s.GMAIL_REFRESH_TOKEN) {
    return { result: { source: 'gcal', ok: false, configured: false, items: [] }, people: [] };
  }
  try {
    const token = await googleAccessToken(db, s);
    const now = new Date();
    const horizon = new Date(now.getTime() + 7 * 86400_000); // week ahead
    const url =
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      new URLSearchParams({
        timeMin: now.toISOString(),
        timeMax: horizon.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: String(max),
      });
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = await safeJson(res);
    if (res.status === 403) {
      // Token exists but lacks calendar.readonly — actionable, not fatal.
      throw new Error('Calendar scope missing — re-mint the Google refresh token with calendar.readonly added');
    }
    if (!res.ok) throw new Error(`Calendar failed: ${json.error?.message ?? res.status}`);

    const people = new Map<string, PersonRecord>();
    const soonMs = 4 * 3600_000; // events starting within 4h are attention-worthy
    const todayKey = now.toISOString().slice(0, 10);

    const items: SourceItem[] = (json.items ?? [])
      .filter((ev: any) => ev.status !== 'cancelled')
      .map((ev: any) => {
        const startIso = ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T00:00:00Z` : '');
        const startMs = startIso ? new Date(startIso).getTime() : NaN;
        const organizer = parseAddress(String(ev.organizer?.displayName || ev.organizer?.email || 'calendar'));
        if (ev.organizer?.email) {
          people.set(ev.organizer.email.toLowerCase(), {
            source: 'gcal', extId: ev.organizer.email.toLowerCase(),
            name: ev.organizer.displayName || organizer.name, email: ev.organizer.email.toLowerCase(),
          });
        }
        const attendees: string[] = (ev.attendees ?? [])
          .filter((a: any) => !a.self)
          .slice(0, 6)
          .map((a: any) => {
            const email = String(a.email ?? '').toLowerCase();
            const name = a.displayName || (email ? prettifyLocalPart(email.split('@')[0]) : 'guest');
            if (email) people.set(email, { source: 'gcal', extId: email, name, email });
            return a.responseStatus === 'declined' ? `${name} (declined)` : name;
          });
        const needsResponse = (ev.attendees ?? []).some((a: any) => a.self && a.responseStatus === 'needsAction');
        const isToday = startIso.slice(0, 10) === todayKey;
        const startsSoon = Number.isFinite(startMs) && startMs - now.getTime() < soonMs && startMs >= now.getTime();

        const when = fmtEventTime(ev.start, ev.end);
        const bits = [
          when,
          attendees.length ? `with ${attendees.join(', ')}` : '',
          ev.location ? `at ${strip(String(ev.location))}` : '',
          ev.hangoutLink ? `meet: ${ev.hangoutLink}` : '',
          ev.description ? clip(strip(String(ev.description)), 120) : '',
        ].filter(Boolean);

        const reasons: string[] = [];
        if (needsResponse) reasons.push('awaiting your RSVP');
        if (startsSoon) reasons.push('starts soon');
        else if (isToday) reasons.push('today');

        return {
          source: 'gcal' as const,
          ref: String(ev.id ?? ''),
          channel: 'Calendar',
          from: ev.organizer?.displayName || organizer.name,
          fromId: ev.organizer?.email?.toLowerCase(),
          title: clip(strip(String(ev.summary ?? '(untitled event)')), 140),
          text: clip(bits.join(' · '), 280),
          ts: startIso,
          isDm: false,
          mentionsMe: needsResponse,
          needsAttention: reasons.length > 0,
          attentionReason: reasons.length ? reasons.slice(0, 2).join(' + ') : undefined,
        };
      });
    return { result: { source: 'gcal', ok: true, configured: true, items }, people: [...people.values()] };
  } catch (e) {
    return { result: { source: 'gcal', ok: false, configured: true, error: (e as Error).message, items: [] }, people: [] };
  }
}

// ---------------------------------------------------------------------------
// One parallel pass + durable persistence
// ---------------------------------------------------------------------------

export async function fetchAllSources(
  db: D1Database,
  s: Settings,
): Promise<{ results: SourceResult[]; people: PersonRecord[] }> {
  const [p, g, z, c] = await Promise.all([fetchPumble(db, s), fetchGmail(db, s), fetchZoho(db, s), fetchGcal(db, s)]);
  return { results: [p.result, g.result, z.result, c.result], people: [...p.people, ...g.people, ...z.people, ...c.people] };
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

/** Chronology-safe timestamp value — handles ISO (pumble/zoho/gcal) AND RFC-2822 Date headers (gmail). */
const tsVal = (ts: string) => {
  const v = Date.parse(ts || '');
  return Number.isFinite(v) ? v : 0;
};

/**
 * Compact, token-efficient digest for the single LLM pass.
 *
 * FAIR SELECTION (critical): items used to be taken source-by-source in
 * order, so a chatty Pumble (75 items) could fill the entire 80-item cap and
 * STARVE Zoho/Gmail out of the prompt completely — the model never saw new
 * company mail at all. Now each source's items are ranked (attention first,
 * then NEWEST first) and prompt slots are dealt round-robin across sources,
 * so every configured source is always represented and fresh mail always
 * reaches the model.
 */
export function digestForPrompt(results: SourceResult[], maxItems = 80): string {
  const ranked = results
    .filter((r) => r.configured)
    .map((r) => ({
      ...r,
      items: [...r.items].sort(
        (a, b) => Number(b.needsAttention) - Number(a.needsAttention) || tsVal(b.ts) - tsVal(a.ts),
      ),
    }));

  // Round-robin deal: 1 item per source per round until the cap is reached.
  const picked = new Map<string, SourceItem[]>(ranked.map((r) => [r.source, []]));
  let total = 0;
  for (let round = 0; total < maxItems; round++) {
    let progressed = false;
    for (const r of ranked) {
      if (total >= maxItems) break;
      if (round < r.items.length) {
        picked.get(r.source)!.push(r.items[round]);
        total++;
        progressed = true;
      }
    }
    if (!progressed) break;
  }

  const lines: string[] = [];
  let i = 0;
  for (const r of ranked) {
    const mine = picked.get(r.source)!;
    lines.push(`## ${r.source.toUpperCase()} — ${r.ok ? `${r.items.length} items (${mine.length} shown, newest/flagged first)` : `ERROR: ${r.error}`}`);
    for (const item of mine) {
      i++;
      const flags = [item.isDm ? 'DM' : '', item.mentionsMe ? 'MENTIONS-YOU' : '', item.needsAttention ? `ATTN(${item.attentionReason})` : '']
        .filter(Boolean)
        .join(' ');
      lines.push(`[${item.source}:${i}] ${item.channel} | from ${item.from}${item.ts ? ` | ${item.ts}` : ''}${flags ? ` | ${flags}` : ''}\n  ${item.title !== item.channel ? `${item.title}: ` : ''}${item.text}`);
    }
  }
  return lines.join('\n');
}
