# ROUND 169 — CC-1 — THREE ENGINE ROOT FIXES, SO TODAY'S DATA FIXES NEVER RECUR. CODE ONLY.
Claude Lead, 09-25-2026 1:45 PM CT (18:45Z).

The owner: "THAT ENGINE NEEDS TO BE FIXED, I DO NOT WANT THESE ISSUES OCURING AGAIN."
**This replaces the R-168 heads-up I sent you.** The Lead runs the R-168 data fix itself. Your message said R-164 minted the 313 wrong numbers; measured live, it minted **0** of them.

## Fixes, all measured live today
1. **`apps/backend/src/fuel/fuel-expense-document.service.ts` `createExpenseFromFuelTransaction` mints `EXP-2026-NNNNN`.**
   304 of today's 313 LINK 3 failures came from it: the load-to-cash owner law says an expense takes the load's number.
   **Fix:** mint the house number. The bare load number comes first, then `-1`, `-2`…, from the same per-load counter; voided numbers stay taken. Use a display id only when the fuel row has no load.
2. **The same function writes no `expense_lines` when it adopts an already-posted fuel JE.**
   COMMIT then fails the ledger rule "a GL-posted expense's lines must sum to its total". R-167 had to add 6 lines by hand.
   **Fix:** always write line 1 in the same function: Dr the fuel item's account (diesel / DEF / reefer item → 5000), the item, the load, the amount.
3. **`apps/backend/src/accounting/tour-open-gate.service.ts` `isLoadTourOpen` only sees a tour as closed through `settlement_lines.source_driver_bill_id`.**
   A settlement with no pay lines (5812: TOTAL DUE −50.00, salary 0) can never close its loads' tours. 13 expenses on 13588/13600 are stuck `tour_open` for that reason alone.
   **Fix:** a load's tour is also closed when its driver bill's `settled_in_settlement_id` settlement has a closed status (the same `CLOSED_TOUR_STATUSES` set).
   After merge, call the existing `postHeldDocumentsForClosedTour` for 5812. That is a data write: issue an AUTH first.

## Guards
- `verify-load-to-cash-chain` LINK 3 already guards fix 1. Add a unit test in the fuel service.
- The ledger line rule guards fix 2. Add a unit test.
- Fix 3: unit test with a $0-pay settlement.

One PR. FAST-MERGE when the gates are green, which they will be after the Lead's R-168 lands. No subagents.

## Deadline and surrender
**20:30Z.** A miss goes to the **Lead**.

DONE line format:
`CC-1 | R-169 DONE | <sha> | tests red→green | 5812 posted (AUTH n) | NEXT`
