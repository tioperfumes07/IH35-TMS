# HORIZONTAL — Load detail office transitions (worked example)

**Law:** `docs/lockdown/BLAST-RADIUS-HORIZONTAL-FIX-LAW-2026-08-31.md`  
**Finding class:** `DISPATCH-OFFICE-TRANSITION-BUTTONS-VERTICAL-SLICE`  
**Status:** OPEN — supersedes piecemeal `#18473` / `#18507` / `#18516` pattern for **future** transitions

## Measured blast radius

```
BLAST RADIUS:
  class: Office load-detail forward transitions hardcoded one button at a time; drawer ignores canonical state machine
  measure: rg 'loadCanMark|new_status:' apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx | wc -l
  N: 3 buttons today; 6 forward edges in allowedTransitions that office may need (dispatched→in_transit, in_transit→delivered_pending_docs, delivered_pending_docs→completed_docs_received, plus cancel/abandon/walkoff/no-show as product allows)
  horizontal_fix: drive buttons from same transition table as backend
  guard: scripts/verify-dispatch-load-detail-transition-buttons.mjs (new)
```

Backend source of truth: `apps/backend/src/dispatch/load-state-machine.ts` — `allowedTransitions` (lines 60–71).

Frontend today: `LoadDetailDrawer.tsx` — `loadCanMarkInTransit`, `loadCanMarkDeliveredPendingDocs`, `loadCanMarkCompletedDocsReceived` duplicate subset of table; **no import** of state machine.

## Target behavior

1. **Single transition table** shared FE+BE (pick one):
   - **Preferred:** move `allowedTransitions` + labels to `packages/shared/dispatch/load-state-machine.ts` imported by backend and frontend; OR
   - **Acceptable:** generate `apps/frontend/src/generated/load-transitions.json` from backend file in CI (verify-step fails if drift).

2. **LoadDetailDrawer** renders a button for each **office-eligible** forward transition from current status:
   - Use existing `updateLoadStatus()` / `transitionDispatchLoad()` path (already money-aware — `apps/frontend/src/api/loads.ts`).
   - Button label map (examples): `in_transit` → "Mark in transit", `delivered_pending_docs` → "Mark delivered (pending docs)", `completed_docs_received` → "Mark completed (docs received)", `cancelled` → existing cancel flow.

3. **Office eligibility filter:** not every backend edge gets a button (e.g. `driver_no_show` may stay dispatch-board-only). Define `officeTransitionTargets: DispatchStatus[]` allowlist; guard asserts implemented buttons ⊆ `allowedTransitions[current] ∩ officeTransitionTargets`.

4. **Delete** hand-rolled `loadCanMark*` once table-driven; keep unit tests on **table parity** not per-button literals.

## Guard spec

`scripts/verify-load-transitions-from-state-machine.mjs`:

- Read `LoadDetailDrawer.tsx` and shared transition source.
- For each status in `dispatchStatusSchema`, compute expected office buttons from table ∩ allowlist.
- FAIL if drawer contains a hardcoded `new_status: "..."` not in expected set for any status fixture.
- FAIL if any expected office transition has no button wiring (grep for target status in drawer).
- `--selftest`: plant fake hardcoded button → guard FAIL.

Retire or narrow: `verify-dispatch-load-detail-deliver-transition.mjs` once horizontal guard subsumes it.

## Acceptance (Live Chrome — after deploy)

USMCA load in `dispatched` (e.g. L13512):

1. Open load detail drawer → see **Mark in transit** (and only legal transitions).
2. Click → reload → status `in_transit`.
3. Repeat through delivered → completed without new PRs per hop.

Proof line:

```
SEAT | LIVE-CHROME | DISPATCH-OFFICE-TRANSITIONS | healthz=<sha> | url=https://app.ih35dispatch.com/dispatch/... | click=Mark in transit→Mark delivered→Mark completed | reload=PASS | GO
```

## Out of scope (this horizontal PR)

- Driver PWA stop micro-states (`at_pickup` / `at_delivery`) — stay in stop writer.
- Settlement close for L-0014 — separate Chrome path (Settlements UI).
- New transitions not in `allowedTransitions` — design change, not this refactor.

## Lane

**Cursor** — mechanical/UI, non-financial wiring. One PR, one guard. Do **not** open a fourth vertical button PR.
