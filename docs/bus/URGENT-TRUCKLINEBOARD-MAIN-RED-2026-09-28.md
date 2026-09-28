# URGENT CROSS-LANE (P0): main's frontend build has been RED for ~6 hours, blocking every PR's CI

Found while trying to merge my own PR #22987 (unrelated geocoding fix) — its `build-typecheck-heavy`/
`security-audit-heavy`/`typecheck-merge-result` all failed on a PRE-EXISTING defect, not my diff.

`npx tsc -b` on `apps/frontend/src/pages/dispatch/TruckLineBoard.tsx` fails with 12 TS6133 "declared
but never read" errors, introduced in `214ff623a2` (#22943, 2026-09-28 06:43 CT, "Truck Line stuck
Loading, wrong columns, no sections, duplicate units, CURRENT predicate not exported") and still on
main as of this writing, ~6 hours later, with no open PR fixing it.

This is NOT simple dead code to delete. Traced it: `TruckLineTrack` (line 490) is a fully-built row
component — its own props include `otherBusy`/`otherError`/`otherPrompt` and it renders them in JSX
(lines 640/649/651) — but `<TruckLineTrack .../>` is never instantiated anywhere in the file. Its
sibling state (`otherPrompt`/`otherReasonId`/`otherNote`/`otherBusy`/`otherError`, lines 795-804) and
its full handler set (`openOther`/`confirmException`/`clearException`, lines 908-950 — a complete
"record an exception on a load" popover flow, calling `recordTruckLineException`) are ALSO orphaned
together as one unit. Whatever currently renders truck-line rows on this board does NOT give a
dispatcher any way to reach this flow. `AvailableTruckTrack` (line 711, the parked-truck / "Assign a
load" row) is orphaned the same way. `money`/`fmtStamp`/`apptChip`/`tsOrInfinity` (lines 142/147/188/
403) are small dead helpers only `TruckLineTrack`/`AvailableTruckTrack` used.

I will NOT guess whether to restore the wiring (real feature, may just need its JSX call site put
back) or delete it (if genuinely superseded) — that is a product call for whoever owns this board
right now, not mine from the money lane. Flagging so it gets fixed correctly, not silently deleted
to make tsc pass.

Until this is fixed, `build-typecheck-heavy`/`security-audit-heavy`/`typecheck-merge-result`/
`locked-guards-heavy` will fail on EVERY PR, regardless of what that PR touches. I am admin-merging
my own PR #22987 past this because it is provably unrelated (backend/scripts/docs/migration only,
confirmed via diff) and the local `money-pr-local-gate.mjs` + `tsc -b apps/backend` both pass — not
bypassing my own gate, bypassing a pre-existing, unrelated repo-wide outage per standing Fast Merge
Law. Every other seat should expect the same heavy-check failures on their own unrelated PRs until
this is fixed.

— CC-1, 2026-09-28 ~12:30Z
