# ROUND 165 — CC-1 — FIX THE FEED EXPENSE WRITER AT THE ROOT. CODE ONLY. ONE PR, TWO GUARDS.
Claude Lead, 09-25-2026 12:52 PM CT (17:52Z).

Owner: "THAT ENGINE NEEDS TO BE FIXED, I DO NOT WANT THESE ISSUES OCURING AGAIN."

## Measured, verified live and in code (main e68dcfeecd)
1. **No account and no item on the line.** `apps/backend/src/feed/seed-settlement-document.service.ts` `seedExpense()` (around line 642) inserts `accounting.expense_lines` with **no `expense_account_uuid` and no `item_id`**. So every non-fuel settlement expense posts to **5000 Fuel & Diesel**: scales, tolls, washout, lumper, parking.
   Example: `13523-14`, a $15.25 scale, is posted Dr 5000.
   The item catalog maps them correctly:

   | Item | Account |
   |---|---|
   | OTR-Scale | 5300 |
   | Highway Toll | 5300 |
   | Parking | 5300 |
   | Washout | 5320 |
   | Lumper | 5310 |
   | Tires | 5500 |
   | Repair | 5400 |
   | Oil and additives, tools | 6160 |
   | DEF, reefer fuel | 5000 |

2. **Reimbursement copies booked as a second cost.** `feed_input.json` merges the company and driver documents, so a cost the driver paid prints twice: once as the company expense and once as "Driver Reimbursement-…". The writer books both.
   Examples:
   - 5775 / 5776 / 5778 / 5793 / 5801: scale 15.25 and 5.25;
   - 5794 / 5800: DEF 30.30.

   It also books lines the parser duplicated:
   - 5774 reefer 45.47;
   - 5784 washout 55.21;
   - 5785 lumper 10.00;
   - 5787 parking 22.00.

   The company document prints each of these once.
3. **DEF booked twice.** DEF is booked once as the card fuel expense (`source_fuel_transaction_id`, Cr 2510: the LAW 4 record) and again as a regular expense (Cr 1000).

The Lead is fixing the existing August and September data under AUTH-021 (R-164). **You fix the writer, so no new document can repeat any of this.**

## Order (code only, no production writes)
1. **`seedExpense`:** resolve the line's item by `item_name` in `catalogs.items` (USMCA first, then global). Set `expense_lines.expense_account_uuid = default_expense_account_id` and `item_id`.
   - No item or no account: **refuse**. Never post to a default.
2. **Company document is the quota.** Book an expense line only up to the number of times that amount prints in the **company** settlement's EXPENSES block (`data/alwaystrack/settlements-truth-*.json` `company[].expenses`, or the Company_Settlement text). "Driver Reimbursement-…" lines are the payment path, not a second cost.
3. **DEF and reefer.** Never create a regular expense when a card fuel expense for the same load and amount exists. One fuel purchase, one expense.
4. **Guard A:** `scripts/verify-expense-line-account-matches-item.mjs`. Every live USMCA expense line with an item posts to that item's `default_expense_account_id`. Planted-red selftest.
5. **Guard B:** `scripts/verify-no-fuel-purchase-booked-twice.mjs`. No regular expense duplicates a card fuel expense (same load, same amount, kind def/reefer). Planted-red selftest.
6. **Wire both** into `scripts/verify-steps/` and `money-pr-local-gate`.
   - They go green only after the Lead's R-164 data fix lands. Until then they are red on live data by design: merge the code, run them in report mode, and flip them to blocking when R-164 is CONSUMED.
   - Nothing else. No subagents.

## Deadline and surrender
**20:00Z.** A miss goes to the **Lead**.

DONE line format:
`CC-1 | R-165 DONE | <sha> | guard A/B selftest red→green output | NEXT`
