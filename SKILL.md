---
name: solent-context-persistence
description: "Enhance SOLENT's context retention across brief runs to prevent completed items from resurfacing."
version: 1.0.0
author: AI Developer
---

# SOLENT Context Persistence Enhancement

## Problem

Completed work (e.g., "TSL booth cleared") resurfaces as pending in subsequent brief runs. The `brief_snapshots` table exists but the LLM doesn't correctly interpret resolution patterns.

## Solution

### 1. Enhanced Context Hint Injection

Modify `worker/src/brief.ts` to:

- Detect resolution patterns in headlines ("cleared", "handled", "resolved", "sent", "replied")
- Add them to a dedicated `RESOLVED_ITEMS` block in the prompt
- Provide explicit instruction: "Items in RESOLVED_ITEMS are DONE - do not re-propose"

### 2. Pattern Matching for Resolution Verbs

Add to `brief.ts`:

```typescript
const RESOLVED_PATTERNS = [
  /cleared/i, /handled/i, /resolved/i, /sent/i,
  /replied/i, /completed/i, /finished/i, /done/i
];

function extractResolvedItems(recent: BriefSnapshot[]): string {
  const resolved: string[] = [];
  for (const b of recent) {
    const headline = String((b.brief as any)?.headline ?? '').toLowerCase();
    for (const pattern of RESOLVED_PATTERNS) {
      if (pattern.test(headline)) {
        resolved.push(`- ${b.created_at}: ${(b.brief as any)?.headline}`);
      }
    }
  }
  return resolved.length
    ? `RESOLVED ITEMS (already handled):\\n${resolved.join('\\n')}\\n\\nNOTE: These items are COMPLETE - do not re-propose them as priorities.`
    : '';
}
```

### 3. Enhanced Brief System Prompt

Update `briefSystem()` in `brief.ts` (line 105):

```typescript
+    'RESOLVED_ITEMS block lists work already completed — do NOT re-propose' +
+    (resolvedItems ? '\\n' + resolvedItems : '') +
```

### 4. Test Cases

Add to `worker/tests/connectors.test.ts`:

- "Cleared TSL booth" should mark item as handled
- "Sent reply to Kemi" should resolve inbound loop
- "Handled Gmail setup" should not create new task

## Files Modified

1. `worker/src/brief.ts` - enhanced context injection
2. `worker/tests/connectors.test.ts` - test cases for resolution patterns

## Verification

1. Run `npm run lint` - TypeScript check passes
2. Run `npm run test:worker` - tests pass
3. Build with `npm run build` - bundle < 200KB

## Deployment

```bash
# Local test
npm run setup  # if D1 doesn't exist
npm run start  # run dev server
# Visit http://localhost:3000

# Production deploy (from repo root)
npm run build  # builds React app
cd worker
npx wrangler deploy --env selfhost  # or default for managed
```