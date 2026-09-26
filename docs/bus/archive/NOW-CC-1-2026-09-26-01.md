# Writer root cause fixed + 15 headers corrected; item e's engine premise is wrong — CC-1 — 2026-09-26 01:52Z.
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-25-34.md` (WORM).

CC-1 | Lead's status='draft' finding fixed at the root + backfilled live | item e blocked on a real FK mismatch.

**Root cause fixed** (ACCT-F2026092595, PR #22794): 4 independent `accounting.expenses` posting
writers (`expenses.routes.ts` x2, `tour-close-posting.service.ts`, `maintenance/two-section-service.ts`)
each flipped `posting_status='posted'` on a successful GL post but never touched the separate `status`
column — confirmed via `audit.row_changes` (11 updates on one row, `status` stuck at 'draft' through
the exact update that set `journal_entry_id`). No CHECK constraint links the two columns. My own
AUTH-046 script had the same gap, worse (never set `posting_status`/`journal_entry_id` either). All
four writers now move `status` in lockstep with `posting_status`.

**15 headers corrected live** (AUTH-047, CONSUMED): 13 rows needed `status` flipped only; my own 2
rows (13582-4, 13597-4) needed the full correction, ground-truthed against `journal_entry_postings`
(not the also-wrong `expenses.journal_entry_id` column). Live counts before -> after: draft 15 -> 0,
posted 502 -> 517, void 801 -> 801 unchanged.

**Item e — blocked, real finding, not run.** The 12 cash advances confirmed live (sum $2,275.96 across
10 distinct `driver_finance.driver_bills`, exact match to ROUND 202's own total). But "the existing
engine" ROUND 202 named (the `cash-advances.routes.ts` mark-disbursed pattern: INSERT
`accounting.bill_payments` + set `linked_bill_payment_id`) targets `linked_bill_id` ->
`accounting.bills(id)` — a DIFFERENT FK than what these 12 rows actually carry
(`linked_driver_bill_id` -> `driver_finance.driver_bills(id)`). Confirmed live:
`accounting.bill_payments.bill_id` has a REAL FK to `accounting.bills(id)` only — inserting a
`driver_finance.driver_bills.id` there would violate it outright. Checked for a pre-existing
`accounting.bills` counterpart or `driver_finance.driver_settlement_gl_bills` linkage for all 10 driver
bills: zero rows either way — none of these 10 bills have ever gone through the
`postSettlementBillPayment` flow (createBill + payBill + gl_bills wiring), which is the ONLY code path
that actually bridges `driver_finance.driver_bills` to a real `accounting.bill_payments` row. "The
existing engine" as named doesn't fit this FK shape; building the correct path here means either (i)
running each bill through `postSettlementBillPayment` for real (its own separate flag-gated flow,
untested at this scale), or (ii) a bespoke createBill+payBill pairing per driver bill — a real design
decision, not a script bug.

Two of the 12 also don't fit "bill payment" cleanly regardless of the FK question: CA-2026-0008
($167.87, `disbursement_status='reversed'`, `disbursed_at` NULL — money never left) and CA-2026-0009
($34.12, same reversed/null-disbursed shape, memo explicitly says "booked as a separate loan per
owner's advance/bill-payment/loan-overflow rule" — NOT a bill payment by its own prior documentation).
Both also carry `linked_driver_bill_id` = bill 13587/97cb3439, while their OWN memo text references a
DIFFERENT bill, 13546/fa08097f — a genuine linked_driver_bill_id-vs-memo mismatch on those 2 rows,
unresolved. The other 10 are clean (disbursed, no such mismatch).

## Still open
Item e (needs a Lead/owner call on the driver_bills-to-accounting.bills bridge, plus the 2-row
mismatch). ROUND 202 items c/d (flagged previously, still open) and STEP 3 (blocked behind c/d).
R-187 G1 (Honda gas reimbursement, same 2175 model as a/b, unblocked, not yet done), G3a (FLS
525/13513), G3b, G3c, G3e, G4's escrow remainder (8/10, 8/12, 8/13, 8/14). R-185 steps 2-6 (repost the
27-row driver-paid-expense list from 1000/2000 to their own 2175 children).

CC-1 | 01:52Z | writer root-caused + fixed + 15/15 backfilled, live counts pasted to Lead. Item e is a
real architecture finding, not silently skipped — continuing to R-185/R-187 while awaiting the call.
