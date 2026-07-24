# SOLENT — Total UX/UI Overhaul: Preparation Document

_Status: prep · 2026-07-24 · owner: Iyobosa + AI developer_

This is the groundwork for a full redesign of the SOLENT Command Centre. It
inventories what exists, critiques the current information architecture, and
lays out a phased overhaul plan so the redesign can proceed without breaking
the daily-driver deployment.

---

## 1. Design principles (proposed north star)

1. **Zero silent loss.** Anything the system drops, caps, or filters is
   declared (coverage ledger — shipped). The UI must always answer "am I
   seeing everything?"
2. **States are never destroyed.** Every generated brief is a restorable
   timeblock (shipped). Extend the same principle to chat threads, focus
   sessions, and triage batches.
3. **One glance, one thumb.** Mobile is a first-class surface: everything
   reachable within thumb range, 44px minimum touch targets, no hover-only
   affordances.
4. **Credits visible, spend deliberate.** Any action that costs a model call
   is visually distinct from free actions.
5. **Voice as an equal input.** The mic is not decoration — dictation now,
   voice commands next.

## 2. Current design-token inventory (`src/index.css` `@theme`)

| Token | Value | Role |
|---|---|---|
| `solent-bg` | `#080a09` | app background |
| `solent-surface / -2 / -3` | `#0d100f / #111513 / #171c19` | card layers |
| `solent-border / -soft` | `#222925 / #1a201d` | hairlines |
| `solent-text / muted / dim / faint` | `#edf2ef / #8e9993 / #8e9993 / #57615c` | type ramp (note: `muted` and `dim` are duplicates — consolidate) |
| `solent-mint / mint-bright` | `#b9f6ca / #7cf5a5` | brand / success / primary action |
| `solent-blue` | `#8fd2ff` | info / zoho / timeblocks |
| `solent-purple` | `#c3b3ff` | pumble / drafts |
| `solent-orange` | `#ffc184` | attention / warnings / coverage gaps |
| `solent-red` | `#ff9d9d` | recording / destructive |
| Fonts | Inter (sans), DM Mono (mono) | |

**Overhaul actions:** de-duplicate `muted`/`dim`; define semantic aliases
(`--color-attention`, `--color-cost`, `--color-free`) instead of raw hues;
add a spacing + radius scale; add motion tokens (durations/easings) so
animation is consistent.

## 3. Component inventory

| Component | Role | Overhaul notes |
|---|---|---|
| `Topbar` | brand, mode nav, search, profile | mobile mode strip added; search is decorative → wire to palette; notifications bell is fake |
| `LeftRail` | agent council list | hidden on mobile with no replacement; "Collective capacity 82%" is hardcoded fiction — remove or make real |
| `CenterStage` | ALL modes + dashboard + inbox + focus + perf (845+ lines) | **split into per-mode files**; Dashboard alone should decompose into MetricsRow, AttentionQueue, PriorityQueue, SignalRadar, DraftsShelf |
| `RightRail` | context timeline | overlay on mobile; verify |
| `BottomBar` | cmd, priorities, credit | good candidate for mobile bottom-nav home |
| `CommandPalette` | ⌘K actions | grow into universal search (items, people, snapshots) |
| `SourcesModal` | credentials | long form → wizard with per-source test buttons |
| `AgentPane` | agent workspaces | fine |
| `KnowledgeGraph` | canvas graph | needs touch gestures (pinch zoom, drag) |
| `Timeblocks` (new) | saved brief states | candidate to become a first-class TIMELINE mode |
| `TriageActions`, `OpenLoops`, `ItemContextDrawer` | triage layer | ItemContextDrawer should become bottom-sheet on mobile |
| `useVoiceInput` (new) | dictation hook | phase 2: push-to-talk, command grammar, server-side fallback |

## 4. IA critique — what the redesign must fix

1. **Six flat modes** (COMMAND/FOCUS/RECEIVE/GRAPH/DEEP/PERFORMANCE) blur
   hierarchy. Reality: COMMAND + RECEIVE carry ~90% of use. Proposal: three
   primary surfaces — **Today** (brief+priorities+attention), **Inbox**
   (unified triage), **Talk** (CONDUCTOR) — with Graph/Performance/Focus as
   secondary tools.
2. **The dashboard scrolls forever** on a phone: summary → metrics →
   timeblocks → deferred → loops → tasks → activity → signals → drafts.
   Needs progressive disclosure: metrics + top-3 attention above the fold,
   the rest behind tabs or accordions.
3. **Left rail is dead weight on mobile** (hidden entirely). Agents should be
   reachable via bottom-nav "Council" tab or palette.
4. **Decorative elements erode trust**: fake notification pulse, "Graph Sync:
   ON", "Collective capacity 82%". Every indicator must be real or removed.
5. **Hover-dependent information** (chip tooltips incl. coverage notes) is
   invisible on touch. Coverage details need a tap-to-open sources sheet.

## 5. Mobile groundwork (shipped this pass) & next steps

Shipped:
- `viewport-fit=cover` + safe-area insets on Topbar/BottomBar/Composer
- Mobile mode strip (horizontal scroll, 36–44px targets) — phones can now
  switch modes at all
- 40px+ touch targets on composer icon buttons, triage/timeblock buttons
- Standalone web-app meta (add-to-home-screen ready)

Next (overhaul phase):
- Bottom navigation bar replacing the mode strip (Today / Inbox / Talk / More)
- Bottom-sheet pattern for ItemContextDrawer + defer menus
- Swipe gestures on inbox rows (swipe right = sorted, left = defer)
- PWA manifest + icon + offline shell for true installability
- Reduce bundle (<150 kB gz) — lazy-load Graph and AgentPane

## 6. Voice roadmap

- **Phase 1 (shipped):** Web Speech dictation into the command bar, graceful
  fallback when unsupported, recording state affordance.
- **Phase 2:** push-to-talk (hold mic / hold Space), voice command grammar
  ("run brief", "open inbox", "defer this until tomorrow"), transcript
  confirmation UX.
- **Phase 3:** server-side transcription fallback (Workers AI/Whisper) for
  Firefox etc.; spoken brief (TTS) for hands-free morning pass.

## 7. Overhaul phases

| Phase | Scope | Risk |
|---|---|---|
| 0 (done) | Coverage ledger, timeblocks, voice skeleton, mobile groundwork | shipped incrementally |
| 1 | Token cleanup + CenterStage decomposition (no visual change) | low — pure refactor |
| 2 | New IA: 3 primary surfaces, bottom nav on mobile, progressive disclosure dashboard | medium — navigation changes |
| 3 | Touch interactions: bottom sheets, swipe triage, graph gestures; PWA manifest | medium |
| 4 | Visual re-skin on the cleaned tokens; motion system; voice phase 2 | high — do last, behind the stable structure |

Each phase ships independently to the daily driver; no big-bang rewrite.

## 8. Open questions for Iyobosa

1. Bottom-nav labels: "Today / Inbox / Talk / More"? Or keep the SOLENT
   mode vocabulary (COMMAND/RECEIVE/DEEP)?
2. Should timeblocks auto-pin the last state before each new pull, or is
   manual pinning enough?
3. Voice: dictation-only for now, or prioritize command grammar next?
4. Any brand direction for the re-skin (keep mint-on-charcoal, or explore)?
