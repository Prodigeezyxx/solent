# SOLENT Agent Rules

Hermes: when working in this repo, follow these rules.

## Build & Verification

- Always run `npm run build` before marking work complete
- Run `npm run lint` (TypeScript noEmit) to check types
- Worker migrations are at `worker/migrations/` - always run `npm run setup` for fresh local D1

## Task Deduplication & Context Retention

### Past Brief Context Injection

Every new brief pass receives CONTEXT FROM PREVIOUS BRIEFS (brief.ts:357-368):
- Last 3 brief snapshots are injected into the LLM prompt
- Headlines only (truncated to 120 chars)
- Prevents "cleared TSL booth" from resurfacing

**This mechanism is working correctly.** If you see items resurfacing:
1. Check that `brief_snapshots` table has recent entries
2. Verify `BRIEF_FRESHNESS_MINUTES` (default 3) allows re-pull
3. The issue is likely in how the LLM interprets "already handled"

### Task Lineage & Source Refs

All tasks from briefs carry `source_ref` (e.g., `[pumble:12345]`) for linking back to the original item.

### Agent Communication Patterns

- **ATLAS**: Task planning, priority sequencing
- **SCRIBE**: Log insights to memory
- **JUDGE**: Log decisions with rationale
- **HERMES**: Draft replies
- **CONDUCTOR**: Orchestrator - can invoke all tools

## Critical Endpoints (Zero-LLM)

- `GET /api/brief` - cached brief (30 min TTL)
- `GET /api/graph` - knowledge graph nodes/edges
- `GET /api/attention` - items flagged "needs you"
- `GET /api/loops` - open commitments
- `POST /api/chat` with `{agent: "HERMES"}` - tool-calling specialist

## Data Flow Pattern

```
Sources → fetchAllSources() → fetchAll (Pumble, Gmail, Zoho, GCal)
    ↓ (parallel HTTP, zero credits)
Items + People persisted to D1 (persistenPass)
    ↓
LLM ONE CALL via runBrief() orchestrate()
    ↓
Brief JSON → priorities, signals, replies
    ↓
persistBrief() → tasks created, linked to source_ref
    ↓
Cache + snapshots saved
```

## Source Connection Requirements

| Source | OAuth Flow | Notes |
|--------|-----------|-------|
| Pumble | API Keys addon | Workspace directory cached 24h |
| Gmail | OAuth2 refresh token | Needs `gmail.readonly` + `calendar.readonly` |
| Zoho | OAuth2 refresh token | Needs `ZohoMail.messages.READ` |
| GCal | Shares Gmail OAuth | Same token as Gmail |

## Model Configuration

Default: `poolside/laguna-xs-2.1:free`
Model-agnostic: set `OPENROUTER_MODEL` env var
Support for JSON response_format with fallback extraction

## Key Insight: Coverage Ledger

All fetchers report `coverage: { available, fetched, capped, note }`
This prevents silent drops - when `capped=true`, note explains why
UI shows gaps as `70/~201` with tooltip explanation