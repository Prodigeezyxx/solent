# NEXUS Command Centre

NEXUS is your **second executive-function layer**: it connects your real work sources — **Pumble** (team chat), **Gmail** (personal), and **Zoho Mail** (company) — pulls everything in **one shot**, triages it with a **single model call**, and turns it into priorities, signals, and drafted replies.

## How the one-shot pass works (credit optimisation)

1. **Fetch (zero credits).** Pumble channels, Gmail inbox (metadata + snippets), and Zoho Mail are pulled **in parallel** over plain HTTP.
2. **Condense before prompting.** Items are HTML-stripped, clipped to ≤280 chars, and capped at ~40 items — keeping the prompt a few thousand tokens.
3. **Exactly ONE model call.** No agent loops, no tool rounds. One structured-JSON response contains the headline, summary, priorities, signals, and reply drafts.
4. **Cache.** The brief is cached in D1 (default 30 min, configurable). Reopening the dashboard inside the window costs **zero credits**. Empty inboxes never trigger a model call at all.
5. **Free context reuse.** The CONDUCTOR chat injects the cached brief into its system prompt for free — no extra pulls.

## Completed features

- **One-shot executive brief** — `POST /api/brief` pulls all sources → one LLM call → priorities persisted as tasks in D1
- **Pumble connector** — official API-Keys addon; scans channels (optionally restricted via `PUMBLE_CHANNELS`)
- **Gmail connector** — OAuth2 refresh-token flow; inbox metadata + snippets, promotions/social filtered out
- **Zoho Mail connector** — OAuth2 refresh-token flow; auto-discovers account id, multi-DC support
- **Sources panel in the UI** — connect/rotate all credentials at runtime (stored in D1, write-only; env vars as fallback)
- **Unified RECEIVE inbox** — all three sources merged, filterable, with per-item "reply →" handoff to CONDUCTOR
- **HERMES reply drafts** — the brief proposes ≤3 replies for messages awaiting you; refine them in the chat thread
- **Live dashboard** — headline, executive summary, source health chips, real task queue from D1
- **CONDUCTOR chat** (DEEP mode) — tool-calling orchestrator (capture task / complete / memory / decision) with cached-brief context
- Single-process serving: the Cloudflare Worker serves both the API and the built React app

## Entry URIs

| Path | Purpose |
| --- | --- |
| `/` | Dashboard (COMMAND), unified inbox (RECEIVE), chat (DEEP), focus, performance |
| `GET /api/health` | Service health |
| `GET /api/brief` | Cached brief (zero-credit read path) |
| `POST /api/brief?force=1` | Run the one-shot pass now (one model call) |
| `GET/POST /api/settings` | Connector credentials (secrets write-only, never echoed) |
| `GET /api/state` | Tasks + memories snapshot |
| `POST /api/tasks`, `POST /api/tasks/:id/toggle` | Task CRUD |
| `POST /api/chat` | CONDUCTOR chat (SSE) |

## Connecting your sources (once, from the UI → "sources" chip)

- **Pumble:** install the *API Keys* addon in Pumble → generate key → paste. Optional: limit channels (`general, product`).
- **Gmail:** Google Cloud project → enable Gmail API → OAuth client (scope `gmail.readonly`) → obtain a refresh token → paste client id/secret/refresh token.
- **Zoho Mail:** [Zoho API console](https://api-console.zoho.com) → Self Client → scopes `ZohoMail.messages.READ,ZohoMail.accounts.READ` → generate refresh token. Set data centre (`com`, `eu`, `in`, …) if not US.
- **Model:** OpenRouter API key. Default model is configurable; a cheap/free model works — the pass needs only one JSON completion.

Credentials can also be provided as Worker secrets (`wrangler secret put PUMBLE_API_KEY` etc.); values saved in the UI take precedence.

## Local use

```bash
npm install && npm run build          # build the UI
cd worker && npm install
npx wrangler d1 migrations apply nexus-db --local
npx wrangler dev --port 3000          # serves API + UI together
```

In the sandbox: `pm2 start ecosystem.config.cjs`.

## Data architecture

- **D1 (SQLite):** tasks, memories, decisions, agent runs, settings (credentials + OAuth token cache + brief cache)
- **Connectors:** Pumble API-Keys addon, Gmail REST v1, Zoho Mail REST — all read paths, no external state
- **LLM:** OpenRouter (model-agnostic), one structured-JSON call per brief run

## Deployment

Cloudflare Workers with static assets: `cd worker && npx wrangler deploy` (set a real `database_id` in `wrangler.toml` and run remote migrations first).

## Recommended next steps

- Send path: post approved drafts back through Pumble `sendMessage` and Gmail/Zoho send scopes
- Scheduled runs: a Cron Trigger calling `runBrief` each morning so the day is triaged before you open the app
- Per-item done/dismiss state on the unified inbox
