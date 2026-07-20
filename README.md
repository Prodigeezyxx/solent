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

## Not yet implemented

- Authentication and per-user workspaces
- Persistent task, signal, calendar, and memory storage
- Live calendar, CRM, email, and knowledge-source connectors
- Server-side model routing and real multi-agent execution
- Streaming agent responses, run traces, evaluations, and approval gates
- Production analytics and observability

## Recommended next steps

1. Add a Cloudflare Worker/Hono API so model credentials and orchestration remain server-side.
2. Define D1 schemas for workspaces, tasks, entities, memories, decisions, and agent runs.
3. Add explicit human approval gates for outbound actions.
4. Build an agent harness with structured tools, run traces, retry budgets, eval fixtures, and cost/latency telemetry.
5. Add identity, connector authorization, and production deployment configuration.

## Deployment

- **Current preview:** sandbox service on port 3000
- **Production:** not deployed
- **Stack:** React 19, TypeScript, Vite, Motion, Lucide
- **Compatibility note:** this repository is an existing React/Vite application rather than the platform's default Hono + Cloudflare Pages template. The static build is edge-compatible, but one-click hosted deployment may require adaptation.
- **Last updated:** 2026-07-20
