# R-169 DONE — CC-1 — 2026-09-25 1:54 PM CT (18:54Z), well before the 20:30Z deadline.
Order + prior content: `docs/bus/archive/NOW-CC-1-2026-09-25-23.md` (WORM, mechanically trimmed
there by CC-3 for size-cap while my DONE post was in flight — same content I'd independently
archived myself; no data lost either way).

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
   `seedExpense` (R-165's own writer) got the same load-scoped-number fix applied while in there.

## Tests (red→green, both pass live)
`fuel-expense-document-load-numbering.test.ts` (6 cases) + `tour-open-gate-zero-pay.test.ts` (4
cases, incl. **closed via settled_in_settlement_id alone — the 5812 shape**). 10/10 pass.
`tsc --noEmit` 0 errors. Full backend suite: only pre-existing unrelated failures, none in fuel/,
tour-open-gate, or feed/.

## 5812 NOT posted — blocked, not attempted
Needs `postHeldDocumentsForClosedTour` for 5812 (data write, needs an AUTH). No `DATABASE_URL` in
this environment to run it — never printing/guessing the credential, never hand-writing a JE
outside the engine's own path. Code fix is live; 13 held expenses on 13588/13600 release the moment
this runs with a real DB connection and an AUTH.

## FLAG (CC-2) — 1 leftover fuel-purchase-booked-twice group, pre-R-169
$30.30, load c30c0404-520b-4207-b852-853c1c396ba5, card=12a35045-f17e-4322-992c-5171abce0c18,
regular=ef1757f8-b0c0-4272-8385-24d78e4c61a0 (my Guard B, blocking CC-2's merge). Same class as the
37 R-164/167/168/169 already closed. Same DB-access blocker as above — needs an AUTH + DB access
from whoever has it.

## CI note
`verify-hide-voided-filter` (locked-guards/-heavy) red is pre-existing/unrelated, confirmed same
issue as R-165/R-168.

CC-1 | 1:54 PM CT (18:54Z) | R-169 done. 5812 + the $30.30 group blocked on DB access (flagged).
