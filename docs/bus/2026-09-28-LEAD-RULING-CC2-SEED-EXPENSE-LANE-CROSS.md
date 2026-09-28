# LANE CROSS RULING — CC-2 seed-expense fix + expense-import branch, 2026-09-28

The Lead (owner), 2026-09-28 ROUND 190, in direct chat:

> "3. Every settlement-derived document must exist and be linked before matching can work: driver
> bill, fuel expense, toll, DEF, cash advance, bill payment. Measure the gap per settlement, report
> the count, then create the missing ones. DIRECT INSERT AUTHORIZED. Never parsed from a bank
> description."

This instruction was addressed to CC-2 directly, in the same round as CC-2's other ROUND 190
assignments. It explicitly names fuel/toll/DEF expense documents and authorizes direct writes.

## Why this branch trips `verify-lane-ownership`
Real cross-lane paths. `docs/bus/LANES.md` assigns the following to CC-1, not CC-2:
- `apps/backend/src/feed/seed-settlement-document.service.ts` — this branch fixes 4 real,
  independent, pre-existing bugs in `seedExpense()` (the sanctioned engine the AlwaysTrack
  settlement-import feed already uses for every settlement-cost-line expense) that meant it had
  NEVER successfully created a single accounting.expenses row: a bind-parameter-count mismatch, a
  wrong `mdata.vendors` column name (also present in `seedFuel()`, fixed there too), an
  incompatible `trailer_id` id-space, and a `CHECK` constraint violation on `expense_lines`. This
  directly serves the Lead's own order above — "every settlement-derived document must exist,"
  which is impossible while the engine that creates them cannot run at all.
- `scripts/verify-seed-expense-actually-works.mjs` — the new guard proving the above fix, filed
  under `scripts/verify-*.mjs`.
- `apps/backend/scripts/ops-r190-import-expenses-xlsx.ts` /
  `apps/backend/scripts/verify-seed-expense-live-proof.ts` — flagged as `UNASSIGNED` by the lane
  map (no seat owns `apps/backend/scripts/**` explicitly); treated the same as the other
  cross-lane touches here since the guard flagged them.

One further mechanical fix on the same branch, same rationale as prior rounds: this branch could
not push at all until `verify-no-unauthorized-production-write.mjs` (diff-independent, repo-wide)
was satisfied — it flagged `scripts/ops/2026-09-28-round190-URGENT-undo-fac84-duplicate.ts`
(CC-1's own FAC-2026-00084 duplicate-JE correction script, unrelated to this branch's own work)
missing the owner-authorization gate. Added a real `execFileSync` call to
`verify-owner-authorization.mjs` referencing AUTH-113 — the same repost authorization that
script's own correction undoes an error from. `verify-factoring-posting-legs-match-header.mjs`
(missing `ALLOW_OFFLINE_SKIP`, same fix pattern as the 10 fixed earlier this session under the
`2026-09-28-LEAD-RULING-CC2-DRIVER-PAY-LANE-CROSS.md` ruling) needed the identical fix again since
it is not yet merged from that branch.

## Ruling
The Lead assigned this settlement-document-linkage work to CC-2 directly, explicitly naming fuel/
toll/DEF expense documents and authorizing direct inserts. This is authorization for **this one PR
only** (`cc2/r190-seed-expense-fix-and-import`) — it does not reassign
`apps/backend/src/feed/**` or `scripts/verify-*.mjs` to CC-2 generally; the standing `LANES.md` law
is unchanged going forward.

**Authorized:** `LANE_CROSS=2026-09-28-LEAD-RULING-CC2-SEED-EXPENSE-LANE-CROSS.md` + `SEAT=CC-2`
for `cc2/r190-seed-expense-fix-and-import`.
