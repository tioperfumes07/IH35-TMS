# LEAD RULING — CC-3 cross-lane authorization: two new verify-*.mjs guards

**Date:** 2026-09-23
**Files:** `scripts/verify-e10-reversal-is-idempotent.mjs`, `scripts/verify-no-sample-data-holds-a-real-number.mjs`
**Lane crossed:** CC-1 (money/GL/WORM guard ownership)
**Requesting seat:** CC-3

## Authorization

Both guard files were explicitly named, by exact filename, in the Lead's own direct assignment
messages to CC-3:

- `verify-e10-reversal-is-idempotent.mjs` was named as the required guard in **R-98.1-A**
  ("Round 102.3 — R-102-D — THE RUNNER STAMPS THE HEADER IN THE SAME TRANSACTION"), the same
  message that assigned the underlying idempotency fix (five uncovered `inTx()` call sites, the
  REUSE-by-JE-id fallback) to CC-3 as the file's own author (`scripts/ops/e10-void-runner-01-usmca.ts`
  is explicitly CC-3's own file per that same message: "Runner 01 is your file").

- `verify-no-sample-data-holds-a-real-number.mjs` was named as the required guard in
  **R-102-E** ("Round 102.9 — the 16 sample loads hold real load numbers"), item 5 of that same
  message, alongside the renumber script CC-3 built and executed (`scripts/ops/e10-round102e-
  sample-loads-renumber.ts`) as items 1-3 of the identical assignment.

Both guards are the direct, load-bearing verification companions to work the Lead assigned to
CC-3 by name, in the same message, at the same time. Building the fix without its own named guard
would leave the assignment half-done; building the guard under a different seat's PR would split
one atomic unit of work across two lanes for no reason the assignment itself gives.

## Ruling

CC-3 may author, commit, and push both guard files in the same PR as the fix/script they verify.
`LANE_CROSS=LEAD-RULING-2026-09-23-CC3-E10-AND-SAMPLE-LOAD-GUARDS-CROSS-LANE.md` at push time,
and the same line in the PR body, per standing cross-lane procedure.
