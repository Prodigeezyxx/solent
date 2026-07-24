# SOLENT Command Centre

SOLENT is your **second executive-function layer**: it connects your real work sources — **Pumble** (team chat), **Gmail** (personal), **Zoho Mail** (company), and **Google Calendar** (schedule) — pulls everything in **one shot**, triages it with a **single model call**, and turns it into priorities, signals, and drafted replies.

**Production (managed Cloudflare, daily driver):** https://43b829ba-c819-41c0-947c-aaa05f671d04.vip.gensparksite.com

## How the one-shot pass works (credit optimisation)

1. **Fetch (zero credits).** Pumble channels, Gmail inbox (metadata + snippets), Zoho Mail, and Google Calendar (week-ahead events) are pulled **in parallel** over plain HTTP.
2. **Condense before prompting.** Items are HTML-stripped, clipped to ≤280 chars, and capped — keeping the prompt a few thousand tokens.
3. **Exactly ONE model call.** No agent loops, no tool rounds. One structured-JSON response contains the headline, summary, priorities, signals, and reply drafts.
4. **Cache the ANALYSIS, never the INBOX.** The LLM output is cached in D1 (default 30 min, `BRIEF_TTL_MINUTES`). But inside that window, whenever the cached sources are older than `BRIEF_FRESHNESS_MINUTES` (default 3), a **zero-LLM stale-while-revalidate pass** re-pulls all sources, persists new items, and merges the fresh inbox into the cached brief — so a new email is never invisible for more than ~3 minutes, at zero credit cost. The frontend also re-polls every 3 min and on tab refocus.
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
- **Gmail connector** — OAuth2 refresh-token flow; inbox metadata + snippets, promotions/social filtered out, 14-day lookback (`SOURCE_LOOKBACK_DAYS`, max 60)
- **Zoho Mail connector** — OAuth2 refresh-token flow; auto-discovers account id, multi-DC support
- **Google Calendar connector (`gcal`)** — reuses the Gmail OAuth client (needs `calendar.readonly` scope on the refresh token); week-ahead events with full context: times, attendees, location, Meet links, RSVP state. Flags “starts soon / today / awaiting your RSVP”; the brief prompt is calendar-aware (conflicts, meeting prep). Shows an actionable “scope missing” note until the token has the scope — nothing else breaks
- **Universal triage** — every prompt/message/notice system-wide can be marked **sorted** or **deferred** (with wake time); deferred items re-surface automatically; overlay endpoint lets every view hide handled items
- **Live inbox freshness** — zero-LLM stale-while-revalidate (see “How the one-shot pass works”): a new email can never sit invisible behind the brief cache
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
| `POST /api/triage/item/:id` | Mark an item sorted / deferred / reopened |
| `POST /api/triage/ref` | Same, addressed by `{source, ref}` (for brief inbox items) |
| `GET /api/triage/overlay` | `source:ref → triage state` map so views hide handled items |
| `GET /api/triage/deferred` | Deferred items and their wake times |
| `POST /api/tasks/:id/defer\|undefer` | Snooze / restore a task |
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
- **Gmail + Google Calendar:** Google Cloud project → enable Gmail API **and Calendar API** → OAuth client → obtain a refresh token with **both scopes**: `https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly` → paste client id/secret/refresh token. (Token minted with only `gmail.readonly`? Mail still works; Calendar shows a scope note until you re-mint with both — same client id/secret, just re-run the consent flow.)
- **Zoho Mail:** [Zoho API console](https://api-console.zoho.com) → Self Client → scopes `ZohoMail.messages.READ,ZohoMail.accounts.READ` → generate refresh token. Set data centre (`com`, `eu`, `in`, …) if not US.
- **Model:** OpenRouter API key. Default model is configurable; a cheap/free model works — the pass needs only one JSON completion.

Credentials can also be provided as Worker secrets (`wrangler secret put PUMBLE_API_KEY` etc.); values saved in the UI take precedence.

## Local use (your own machine)

```bash
git clone https://github.com/Prodigeezyxx/solent && cd solent
npm run setup                          # installs everything + creates local D1
npm run db:import solent_db_export_YYYY-MM-DD.sql   # ← restores ALL data + credentials
npm run start                          # build UI + serve full app at http://localhost:3000
```

In the sandbox: `pm2 start ecosystem.config.cjs`.

### Moving your data between machines (credentials never touch git)

Credentials and data live in the D1 database, **not** in the repo — pushing
them to GitHub would expose your Gmail/Zoho/Pumble tokens to anyone who sees
it. Instead, carry the database file itself:

```bash
npm run db:export        # → solent_db_export_YYYY-MM-DD.sql (gitignored, contains secrets)
# move that ONE file privately (AI Drive, USB, scp — never git), then on the other machine:
npm run db:import solent_db_export_YYYY-MM-DD.sql
```

The export is the complete state: settings, OAuth tokens, every message,
task, memory, decision, person, triage state, and spend ledger. One import
and the app is exactly as you left it — no reconnecting sources.

To push the same state into a **deployed** Worker's remote D1:

```bash
cd worker && npx wrangler d1 execute solent-db --remote --file=../solent_db_export_YYYY-MM-DD.sql
```

## Data architecture

- **D1 (SQLite):** tasks, memories, decisions, agent runs, settings (credentials + OAuth token cache + brief cache)
- **Connectors:** Pumble API-Keys addon, Gmail REST v1, Zoho Mail REST — all read paths, no external state
- **LLM:** OpenRouter (model-agnostic), one structured-JSON call per brief run

## Deployment

**Current production** runs on a Genspark-managed Cloudflare account (Workers for Platforms): https://43b829ba-c819-41c0-947c-aaa05f671d04.vip.gensparksite.com — deployed from the root `wrangler.jsonc` (managed D1 name/id pinned there; the config's `build.command` rebuilds `dist/` in the pipeline). 100% of data + credentials were migrated into the hosted D1. Note: cron triggers are **not supported** on Workers for Platforms, so the morning auto-brief is disabled there.

**Self-hosting on your own Cloudflare account** (planned): use the prepared `env.selfhost` block in `wrangler.jsonc` — create your own D1, replace `REPLACE_WITH_YOUR_OWN_D1_ID`, run remote migrations, then `npx wrangler deploy --env selfhost`. The cron auto-brief (`30 6 * * 1-5`) is re-enabled in that env. Migrate data with `npm run db:export` → `wrangler d1 execute ... --remote --file=...`.

## Current state & next steps (session log 2026-07-24)

**Done this session:** universal triage system-wide · 14-day Gmail lookback · unshackled brief (10 priorities / 5 replies / 6 signals) · responsive graph canvas · portable DB export/import (`npm run db:export` / `db:import`) · deployed to managed Cloudflare with full data migration · **zero-LLM inbox freshness fix** (root cause of the “missing Zoho email”: 30-min brief cache + mount-only frontend fetch — fetch code was always correct) · **Google Calendar source** with full context · full production pass over every endpoint (all green) · **digest starvation fix** (round-robin source selection — a chatty Pumble can never starve mail out of the LLM prompt again) · **Gmail fetch-cap fix** (triple-query: recency + guaranteed seats for `is:starred` + `is:important`).

**Root-cause class fix — the coverage ledger:** both missed-email incidents were the same bug class: *a selection layer silently dropping items*. Every source fetch now reports **fetched vs available** (`SourceResult.coverage` — Gmail uses `resultSizeEstimate`, Pumble tracks page-cap hits per channel + skipped channels, Zoho/GCal detect full pages). Coverage flows through `Brief.sources` into the UI chips (gap shown as `70/~201` with the note in the tooltip) **and into the LLM digest itself** (`COVERAGE:` header per source), so the model says "older mail exists beyond this pass" instead of implying it saw everything. A silent drop is now structurally impossible — any gap is declared at every layer.

**Timeblocks — saved brief states (migration `0007`):** every LLM pass auto-saves the full brief to `brief_snapshots` (newest 40 unpinned kept; pinned kept forever). Pulling new context never destroys the summary you were exploring: the **Timeblocks** shelf on the dashboard lists previous states — restore (view an old state while the live brief keeps polling underneath, with a "back to live" banner), pin, label, delete. Endpoints: `GET /api/snapshots`, `GET /api/snapshots/:id`, `POST /api/snapshots/:id/pin|label`, `DELETE /api/snapshots/:id`.

**Voice input skeleton:** the composer mic is now live — Web Speech API dictation via `src/hooks/useVoiceInput.ts` (interim transcript streams into the command bar, recording affordance, graceful fallback where unsupported). Roadmap for push-to-talk / voice commands is in `docs/UX_OVERHAUL.md`.

**Mobile groundwork:** `viewport-fit=cover` + safe-area insets (Topbar/BottomBar/Composer), a horizontally-scrollable **mobile mode strip** (phones could previously never leave COMMAND mode), 40px+ touch targets on composer/triage/timeblock controls, add-to-home-screen meta.

**UX/UI overhaul prep:** `docs/UX_OVERHAUL.md` — design-token + component inventory, IA critique, mobile/voice roadmaps, and a 5-phase overhaul plan (each phase ships independently to the daily driver).

**Waiting on the operator:**
- Re-mint the Google refresh token with `gmail.readonly` **+** `calendar.readonly` (same client id/secret) and paste it in Sources → Calendar goes live instantly, no redeploy
- Weekend: fix own Cloudflare account (stale `nexus-worker` / assets-only `solent` deploys), then self-host via `--env selfhost`

**Recommended next steps:**
- Send path: post approved drafts back through Pumble `sendMessage` and Gmail/Zoho send scopes
- Relationship staleness: surface people you haven't spoken to in N days
- Weekly digest: one extra LLM call summarising the week's decisions + open threads
- Optional: access lock on the managed URL (currently public)
