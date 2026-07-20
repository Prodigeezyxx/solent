# NEXUS Command Centre

NEXUS is an AI-native personal operating system for turning signals, memory, relationships, and agent work into a clear daily execution plan.

## Completed features

- Responsive command-centre dashboard for desktop, tablet, and mobile
- Four operating modes: Command, Focus, Receive, and Deep work
- Functional priority queue with completion state
- Focus timer with pause, resume, and reset controls
- Search/command palette with `Cmd/Ctrl + K` and Escape support
- Interactive AI agent council and context panel
- Signal radar, schedule, metrics, system health, and knowledge context
- Functional command composer, status feedback, mobile navigation, and toast states
- Keyboard focus styles, semantic landmarks, skip link, reduced-motion support, and accessible labels
- Production Vite build with zero known package vulnerabilities

## Entry URIs

| Path | Purpose |
| --- | --- |
| `/` | NEXUS dashboard and all client-side workspace modes |

This version is a client-side product prototype and has no public API routes.

## Local use

```bash
npm install
npm run lint
npm run build
npm run dev
```

The app runs on `http://localhost:3000` by default. In the sandbox, use `pm2 start ecosystem.config.cjs` after building.

### Main controls

- Press `Cmd/Ctrl + K` to open the command palette.
- Select a mode from the left navigation.
- Complete or reopen priorities from the queue.
- Select an agent to load its working context.
- Type into the bottom command bar to route a request through CONDUCTOR.

## Data architecture

- **Current state:** in-memory React state with curated prototype data
- **Persistence:** none yet
- **External AI services:** none connected; no secrets are exposed in the frontend
- **Recommended production storage:** Cloudflare D1 for tasks, signals, memories, decisions, and agent runs; KV for preferences and fast session context

## Architecture

NEXUS is now a full-stack app: a React client plus a **Cloudflare Worker** that runs **CONDUCTOR**, a server-side LLM orchestrator.

- **Client** (`src/`): React 19 + Vite + Tailwind. The command bar, palette, and priority queue talk to the Worker over `/api/*`.
- **Worker** (`worker/`): Hono app on Cloudflare, backed by **OpenRouter** (model-agnostic) and **D1** (SQLite at the edge).
- **CONDUCTOR**: on each message it calls OpenRouter with tool-calling enabled. The 13-agent council (ATLAS, SCRIBE, ORACLE, …) is invoked by the model through tools — `capture_task`, `complete_task`, `log_memory`, `log_decision` — which perform **real D1 writes** and are logged to `agent_runs`.
- **Streaming**: chat replies stream back to the UI over Server-Sent Events, so the council feels live.

### Flow

```
UI composer/palette
   │  POST /api/chat  (SSE stream)
   ▼
Cloudflare Worker (Hono)
   │  OpenRouter chat.completions (tools: capture_task, log_memory, log_decision, …)
   ▼
D1  ── tasks / memories / decisions / agent_runs
   │
   ▼
streamed reply + tool events → UI
```

## Local development (two terminals)

1. **Frontend** (this repo root):
   ```bash
   npm install
   npm run dev          # http://localhost:3000
   ```
2. **Worker** (`worker/`):
   ```bash
   cd worker
   npm install
   npx wrangler d1 create nexus-db        # copy the returned id into wrangler.toml database_id
   npm run migrate:local                   # applies migrations/0001_init.sql to local D1
   npx wrangler dev                        # serves the API on http://localhost:8787
   ```
   Vite proxies `/api/*` → `http://localhost:8787` (override with `WORKER_URL`).

3. **Wire the model key** (one time):
   ```bash
   cd worker
   npx wrangler secret put OPENROUTER_API_KEY   # paste your OpenRouter key
   # optional: npx wrangler secret put OPENROUTER_MODEL
   ```
   Without a key the Worker still runs a **deterministic stub** orchestrator so the UI works end-to-end.

> The client sends traffic to `/api/*`; in dev the Vite proxy forwards to the Worker, and in production the Worker is deployed in front of (or alongside) the static assets.

## Not yet implemented

- Authentication and per-user workspaces (currently a single prototype workspace)
- Live calendar, CRM, email, and knowledge-source connectors
- Explicit human approval gates for outbound actions
- Run traces, eval fixtures, retry budgets, and cost/latency telemetry in the UI
- Production analytics and observability

## Deployment

- **Worker:** `cd worker && npm run deploy` (after setting `database_id` in `wrangler.toml` and the secrets above).
- **Frontend:** `npm run build` → static `dist/` (edge-compatible). Serve via Cloudflare Pages or any static host, with `/api` routed to the Worker.
- **Stack:** React 19, TypeScript, Vite, Tailwind, Motion, Lucide · Cloudflare Worker (Hono) · D1 · OpenRouter.
- **Last updated:** 2026-07-20
