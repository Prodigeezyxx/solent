# SOLENT Command Centre

SOLENT is your **second executive-function layer**: it connects your real work sources — **Pumble** (team chat), **Gmail** (personal), and **Zoho Mail** (company) — pulls everything in **one shot**, triages it with a **single model call**, and turns it into priorities, signals, and drafted replies.

## How the one-shot pass works (credit optimisation)

1. **Fetch (zero credits).** Pumble channels, Gmail inbox (metadata + snippets), and Zoho Mail are pulled **in parallel** over plain HTTP.
2. **Condense before prompting.** Items are HTML-stripped, clipped to ≤280 chars, and capped at ~40 items — keeping the prompt a few thousand tokens.
3. **Exactly ONE model call.** No agent loops, no tool rounds. One structured-JSON response contains the headline, summary, priorities, signals, and reply drafts.
4. **Cache.** The brief is cached in D1 (default 30 min, configurable). Reopening the dashboard inside the window costs **zero credits**. Empty inboxes never trigger a model call at all.
5. **Free context reuse.** The CONDUCTOR chat injects the cached brief into its system prompt for free — no extra pulls.

## Completed features

- **One-shot executive brief** — `POST /api/brief` pulls all sources → one LLM call → priorities persisted as tasks in D1
- **Identity layer** — Pumble workspace directory (`/listUsers` + `/myInfo`) cached 24h in D1; every message shows a **real human name**, `<@mention>` tokens are expanded to `@Name`, and SOLENT knows who *you* are
- **Attention engine (zero-LLM)** — deterministic heuristics flag DMs, @mentions of you, direct asks/questions, and urgency keywords → `needs you` badges, a durable attention queue (`GET /api/attention`), and "Needs you" as the first dashboard metric
- **Durable inbox** — every pass upserts people + items into D1 (`people`, `items` tables), so the graph and attention queue survive cache expiry
- **Kimi / model-agnostic** — `response_format` fallback retry + tolerant balanced-brace JSON extraction; set `OPENROUTER_MODEL` to `moonshotai/kimi-k2` (or any slug) and it just works
- **Operator personalization** — set your name + context in Sources; the brief and CONDUCTOR address you and weigh what matters to a founder
- **Morning auto-brief** — Cron Trigger (weekdays 06:30 UTC) runs the pass before you open the app
- **Open loops** — commitments in flight, derived deterministically from every pass (zero LLM): inbound = what you OWE people, outbound = what you're WAITING on; aged, oldest-first, with reply/nudge drafting, resolve/dismiss, auto-close when the counterparty replies, and bot filtering. Loops feed both the brief and CONDUCTOR prompts (with ids), so the model nags about anything > 2 days old and can close loops via the `resolve_loop` tool
- **Item context drawer** — click any inbox or attention item: full message, who the person is (title/email/VIP), your recent history with them, open loops with them, why it was flagged, draft-reply and mark-handled actions. All zero-credit D1 reads
- **Context library** — paste docs/memos/notes in Sources (or just paste into chat — CONDUCTOR saves them via `save_context_doc`); injected compactly as ground truth into every brief and chat, no extra model calls
- **Model picker** — curated frontier presets (Kimi K3, Kimi K2.6, Claude 3.5 Sonnet, DeepSeek V3/R1, Gemini 2.5 Flash, Qwen3 235B) plus any custom OpenRouter slug, and a reasoning-effort selector (off/low/medium/high) that degrades gracefully on models without reasoning support
- **Pumble connector** — official API-Keys addon; scans public channels **and DMs** (optionally restricted via `PUMBLE_CHANNELS`), skips your own messages
- **Gmail connector** — OAuth2 refresh-token flow; inbox metadata + snippets, promotions/social filtered out
- **Zoho Mail connector** — OAuth2 refresh-token flow; auto-discovers account id, multi-DC support
- **Sources panel in the UI** — connect/rotate all credentials at runtime (stored in D1, write-only; env vars as fallback)
- **Unified RECEIVE inbox** — all three sources merged, filterable, with per-item "reply →" handoff to CONDUCTOR
- **HERMES reply drafts** — the brief proposes ≤3 replies for messages awaiting you; refine them in the chat thread
- **Live dashboard** — headline, executive summary, source health chips, real task queue from D1
- **Knowledge graph (GRAPH mode)** — interactive relationship view over everything SOLENT knows, with **four layouts**: Web (force-directed), Orbit (concentric rings by type — attention pulls inward), People (person-centric columns grouped by source), and Timeline (items placed left→right by time). Fullscreen mode, drag/zoom/pan, type filters, detail cards. Built from D1 with zero LLM cost (`GET /api/graph`)
- **Agent council → real feature panes** — every specialist is a full workspace, not a persona: click any agent in the left rail to open its pane with live D1 data + actions. ATLAS (priority queue + oldest loops + add task), SCRIBE (memory log + add), ORACLE (signal radar + per-source volume), HERMES (drafts to copy + messages awaiting reply), HUNTER (GTM signals + external orbit), MUSE (content bank), VAULT (context library + add doc), FORGE (build queue + technical decisions), LEDGER (model spend + live OpenRouter credit), CIRCLE (relationship CRM with VIP starring), JUDGE (decision journal + log form), GHOST (private notes). All pane reads are zero-credit (`GET /api/agents/:id/pane`)
- **Agent-direct chat** — each pane has a direct line to that specialist: it answers in its own voice with the full shared tool belt (capture task, log memory/decision, resolve loop, save doc). `POST /api/chat` with `{agent}`
- **Manual task capture** — add tasks by hand from the dashboard queue (+ Add) or the ATLAS/FORGE panes; delete from panes too
- **Credit accounting** — every model call is recorded in D1 (`llm_usage`: tokens + exact USD cost via OpenRouter usage accounting) and the live account balance is pulled from OpenRouter's `/credits` API. Bottom-bar chip shows remaining credit; LEDGER pane has the full breakdown by model/purpose/day (`GET /api/usage`)
- **Fresh console** — zero seeded/mock data; every panel starts empty and fills only from your real sources
- **CONDUCTOR chat** (DEEP mode) — tool-calling orchestrator (capture task / complete / memory / decision) with cached-brief context
- Single-process serving: the Cloudflare Worker serves both the API and the built React app

## Entry URIs

| Path | Purpose |
| --- | --- |
| `/` | Dashboard (COMMAND), unified inbox (RECEIVE), chat (DEEP), focus, performance |
| `GET /api/health` | Service health |
| `GET /api/brief` | Cached brief (zero-credit read path) |
| `GET /api/graph` | Knowledge graph nodes + edges (zero-credit) |
| `GET /api/attention` | Unseen items flagged by the attention engine (zero-credit) |
| `POST /api/attention/:id/seen` | Dismiss an attention item |
| `GET /api/loops` | Open loops — commitments in flight (zero-credit) |
| `POST /api/loops/:id/resolve\|dismiss` | Close a loop |
| `GET /api/items/:id/context` | Full context for one item: person, history, loops, flag reason |
| `GET /api/items/resolve?source&ref` | Map a brief inbox ref to its durable row id |
| `GET/POST /api/docs`, `DELETE /api/docs/:id` | Context library CRUD |
| `GET /api/models` | Curated model presets for the picker |
| `GET /api/agents/:id/pane` | Agent workspace data — live per-specialist features (zero-credit) |
| `GET /api/usage` | Model spend ledger + live OpenRouter credit balance |
| `POST /api/people/:id/vip` | Toggle VIP on a person (CIRCLE) |
| `POST /api/memories` | Log a memory/note (SCRIBE/GHOST) |
| `POST /api/decisions` | Log a decision (JUDGE) |
| `DELETE /api/tasks/:id` | Remove a task |
| `POST /api/brief?force=1` | Run the one-shot pass now (one model call) |
| `GET/POST /api/settings` | Connector credentials (secrets write-only, never echoed) |
| `GET /api/state` | Tasks + memories snapshot |
| `POST /api/tasks`, `POST /api/tasks/:id/toggle` | Task CRUD |
| `POST /api/chat` | Council chat (SSE) — pass `agent` to talk to a specific specialist |

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
npx wrangler d1 migrations apply solent-db --local
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
- Per-item done/dismiss state wired into the unified inbox UI (API already exists)
- Relationship staleness: surface people you haven't spoken to in N days
- Weekly digest: one extra LLM call summarising the week's decisions + open threads
