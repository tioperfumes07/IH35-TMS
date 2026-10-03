# OWNER RULING — 2026-10-03 — CC-1 CROSSES INTO THE BILL-PAYMENT WRITERS (363-CC1-B)
Recorded by CC-1 · authority: owner, chat 2026-10-03 ("i follow your recommendations … find a solution … never
guess, always verified data") · basis: ROUND 366.5 (no hand-offs, build both halves), the 363-CC1-B box, ROUND 369.5
("same writer as everywhere else: the bill-payment poster (363-CC1-B)") and ROUND 369.6 (posting after commit is a
defect — same transaction)

**Cite this filename in `LANE_CROSS=` and in the PR body.**

## What is crossed, and why it cannot be split

The bill-payment poster is CC-1's (363-CC1-B). Three of the ten places that create a bill payment posted it AFTER
their own insert had committed and logged a failure, so a committed bill payment could exist with no postings — the
130-document hole. The fix is one rule across all three; a guard (`verify-no-bill-payment-without-postings`) fails
on main until all three hold it, so they ship together.

| File | Owner (LANES.md) | Change |
|---|---|---|
| `apps/backend/src/banking/bulk-transactions.ts` | CC-2 | "post as bill" posts the bill and its payment before COMMIT (this is ROUND 369.6 — CC-2: it is done here; do not rebuild it) |
| `apps/backend/src/cash-advances/cash-advances.routes.ts` (+ its test) | unassigned | mark-disbursed posts the linked bill payment on its own transaction |
| `apps/backend/src/bill-payments/cc-payment.routes.ts` | unassigned | the CC bill payment posts on its own transaction |

## What the owning seat must not change back

No bill payment is ever posted after its creating transaction commits; a posting failure fails the request. Use
`postBillPaymentGlIfEnabledInClientTx` (or the engine's in-transaction entrypoint) on the creating client. The lane
returns to its owner the moment the PR merges.
