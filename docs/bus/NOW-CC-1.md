# R-169 DONE — CC-1 — 2026-09-25 1:54 PM CT (18:54Z), well before the 20:30Z deadline.
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-25-23.md` (WORM).

`CC-1 | R-169 DONE | 230815ec1d91cbb121d2306bc43d63c050b4a9a1 | tests red→green below | 5812 NOT posted — no AUTH, blocked on DB access (below) | NEXT: R-159 still blocked on DB access; else idle`

## Fixes (1 PR #22694, code only, no prod writes)
1. `createExpenseFromFuelTransaction` mints the load-scoped number (`generateExpenseNumber`) when
   `fuel.load_id` is set; `nextExpenseDisplayId` only when there is no load. Refuses on an unmapped
   `fuel_type` (only diesel/def/reefer_diesel map to a catalog item) rather than guessing.
2. Same function now ALWAYS writes its `accounting.expense_lines` row (Dr the fuel item's account),
   adopted-JE path and fresh-draft path alike — previously written on neither.
3. `isLoadTourOpen` also resolves via `driver_bills.settled_in_settlement_id` directly, independent
   of whether the settlement produced a `settlement_lines` row — closes a zero-pay settlement's
   tour (5812) that the old settlement_lines-only path could never see.
   `seedExpense` (R-165's own writer) got the same load-scoped-number fix applied while in there —
   it was calling `nextExpenseDisplayId` unconditionally despite always being load-attributed, and
   its `expense_load_links.expense_number` was wrongly set to the bare load_number on every line.

## Tests (red→green, both pass live)
`fuel-expense-document-load-numbering.test.ts` (6 cases: load→house number, no-load→EXP- series,
unmapped fuel_type refuses, expense_lines written adopted+fresh, expense_load_links load-gated) +
`tour-open-gate-zero-pay.test.ts` (4 cases: open/no-settlement, open/non-terminal, **closed via
settled_in_settlement_id alone — the 5812 shape**, closed via settlement_lines unchanged). 10/10
pass. `tsc --noEmit` 0 errors. Full backend suite run: only pre-existing unrelated failures
(samsara/dot-inspections/maintenance-posting/photo-comparison/a DB-fixture column gap) — none in
fuel/, tour-open-gate, or feed/.

## 5812 NOT posted — blocked, not attempted
Order 3 says: after merge, call `postHeldDocumentsForClosedTour` for 5812 (a data write, needs an
AUTH). Same blocker as R-159: no `DATABASE_URL` in this environment to run it — never
printing/guessing the credential, never hand-writing a JE outside the engine's own path. The code
fix is live in main; the 13 held expenses on 13588/13600 will release the moment this runs with a
real DB connection and an AUTH.

## CI note
Merged via `gh api PUT .../merge` (`required-checks-gate` + `hold-merge-gate` both green). The
pre-existing, unrelated `verify-hide-voided-filter` red (locked-guards/-heavy) recurred, confirmed
same issue as R-165/R-168 — not this PR. `build-typecheck-heavy` was still running at merge time;
its earlier run on this same branch failed for an unrelated reason (a pre-existing migration's
missing CANONICAL-CHECK comment on `driver_finance.deduction_recovery_links`, a table this PR never
touches).

## FLAG (CC-2) — 1 leftover fuel-purchase-booked-twice group, pre-R-169
$30.30, load c30c0404-520b-4207-b852-853c1c396ba5, card=12a35045-f17e-4322-992c-5171abce0c18,
regular=ef1757f8-b0c0-4272-8385-24d78e4c61a0 (my own Guard B, blocking CC-2's merge). Same class as
the 37 R-164/167/168/169 already closed, one that slipped the batch. Same blocker as R-159/5812: no
DATABASE_URL, so no void. Needs an AUTH + DB access from whoever has it.

CC-1 | 1:54 PM CT (18:54Z) | R-169 done, 5812 + this $30.30 group blocked on DB access (flagged).
