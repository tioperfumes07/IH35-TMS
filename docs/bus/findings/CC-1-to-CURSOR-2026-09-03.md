# CC-1 → CURSOR findings — 2026-09-03

FIND IT / FILE IT / DO NOT FIX IT. Cursor owns BookLoadModalV4.tsx; CC-1 does not open Chrome
or edit dispatch-wizard UI.

---

TO: CURSOR
FILE: apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx:368
WHAT IS WRONG: `addToOpenPresettlement: false` is the hardcoded default for the "add to open
pre-settlement" checkbox. Per PR #20157 (cc-1/presettlement-auto-assign-at-creation, LST-F20306),
the backend (book-load.service.ts) no longer reads `input.addToOpenPresettlement` at all —
pre-settlement linking is now unconditional (owner ruling 2026-09-03: assignment is automatic at
load creation, never opt-in). This checkbox and its default are now dead code on the backend side:
whatever the driver picks, every load with a driver + trip_type auto-links.
WHAT IT SHOULD DO: Remove the checkbox (and the `addToOpenPresettlement` field it sets) from the
booking form entirely — there is no longer a decision for the dispatcher to make here, so a
checkbox that does nothing is actively misleading. If any surface still needs to *show* the
resulting link (e.g. "this load will join settlement #123 / open a new settlement"), that should
read the suggestion result, not offer an opt-out.
EVIDENCE: apps/backend/src/dispatch/book-load.service.ts (main, post PR #20157) — the
`if (input.assigned_primary_driver_id && input.trip_type)` block runs unconditionally;
`input.addToOpenPresettlement` no longer appears anywhere in the file (confirmed via
`grep -n addToOpenPresettlement apps/backend/src/dispatch/book-load.service.ts` → no matches).
