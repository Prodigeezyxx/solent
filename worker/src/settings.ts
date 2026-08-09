import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from './types';

/**
 * Settings layer: D1-backed key/value store with env-var fallback.
 * Lets the user configure connector credentials from the UI once,
 * without redeploying. Secrets are write-only through the API.
 */

export const SETTING_KEYS = [
  // Pumble (API Keys addon)
  'PUMBLE_API_KEY',
  'PUMBLE_CHANNELS', // optional comma-separated channel names to scan
  // Gmail (OAuth2 refresh-token flow)
  'GMAIL_CLIENT_ID',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_REFRESH_TOKEN',
  // Zoho Mail (OAuth2 refresh-token flow)
  'ZOHO_CLIENT_ID',
  'ZOHO_CLIENT_SECRET',
  'ZOHO_REFRESH_TOKEN',
  'ZOHO_ACCOUNT_ID', // optional; auto-discovered when empty
  'ZOHO_DC', // data centre TLD: com | eu | in | com.au | jp (default com)
  // LLM
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
  'OPENROUTER_REASONING', // off | low | medium | high — reasoning effort for models that support it
  // Operator identity — personalises prompts and attention detection
  'OPERATOR_NAME',
  'OPERATOR_CONTEXT', // e.g. "Founder of Floats XR and realmspace; priorities: GTM partnerships, product velocity"
  // Behaviour
  'BRIEF_TTL_MINUTES', // cache window for the one-shot brief (default 30)
  'BRIEF_FRESHNESS_MINUTES', // zero-LLM source refresh window inside the TTL (default 3)
  'SOURCE_LOOKBACK_DAYS', // how far back email sources scan (default 14, max 60)
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];
export type Settings = Partial<Record<SettingKey, string>>;

const SECRET_KEYS: SettingKey[] = [
  'PUMBLE_API_KEY',
  'GMAIL_CLIENT_SECRET',
  'GMAIL_REFRESH_TOKEN',
  'ZOHO_CLIENT_SECRET',
  'ZOHO_REFRESH_TOKEN',
  'OPENROUTER_API_KEY',
];

export function isSecret(key: string): boolean {
  return (SECRET_KEYS as string[]).includes(key);
}

export async function loadSettings(db: D1Database, env: Env): Promise<Settings> {
  const out: Settings = {};
  // Env fallback first (deploy-time secrets)
  for (const k of SETTING_KEYS) {
    const v = (env as unknown as Record<string, string | undefined>)[k];
    if (v) out[k] = v;
  }
  try {
    const { results } = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
    for (const row of results ?? []) {
      if ((SETTING_KEYS as readonly string[]).includes(row.key) && row.value) {
        out[row.key as SettingKey] = row.value; // D1 overrides env: user-set wins
      }
    }
  } catch {
    /* settings table may not exist yet on first boot */
  }
  return out;
}

export async function saveSettings(db: D1Database, patch: Record<string, string>): Promise<void> {
  const stmts = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!(SETTING_KEYS as readonly string[]).includes(key)) continue;
    if (value === '') {
      stmts.push(db.prepare('DELETE FROM settings WHERE key = ?').bind(key));
    } else {
      stmts.push(
        db
          .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
          .bind(key, value),
      );
    }
  }
  if (stmts.length) await db.batch(stmts);
}

/** Non-secret view for the UI: booleans for secrets, raw values for the rest. */
export function settingsStatus(s: Settings): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const k of SETTING_KEYS) {
    out[k] = isSecret(k) ? !!s[k] : s[k] ?? '';
  }
  return out;
}

// ---- OAuth access-token cache (avoids a token round-trip on every run) ----

interface CachedToken {
  access_token: string;
  expires_at: number;
}

export async function getCachedToken(db: D1Database, provider: string): Promise<string | null> {
  try {
    const row = await db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .bind(`_token_${provider}`)
      .first<{ value: string }>();
    if (!row) return null;
    const tok = JSON.parse(row.value) as CachedToken;
    if (tok.expires_at > Date.now() + 60_000) return tok.access_token;
  } catch {
    /* ignore */
  }
  return null;
}

export async function cacheToken(db: D1Database, provider: string, accessToken: string, expiresInSec: number): Promise<void> {
  const value = JSON.stringify({ access_token: accessToken, expires_at: Date.now() + expiresInSec * 1000 } satisfies CachedToken);
  await db
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(`_token_${provider}`, value)
    .run();
}
