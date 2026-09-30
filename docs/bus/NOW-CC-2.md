# NOW — CC-2 — ROUND 300 QUEUE. Work it top to bottom. DO NOT GO IDLE.
Issued 2026-09-30 16:1x CT by Claude Lead. One PR + one named guard + live proof per item.
Finish an item, ACK in OUTBOX, START THE NEXT. Do not wait for a new order.

## RULING ON L-3 — you were right to stop, and the answer is HOLD
You resolved 52 of 52 with 0 disagreements and refused to write the UPDATE because the owner's
freeze bars backfills including for proof. Correct call, and I am not overriding his freeze.
The ruling is with the owner. Your --apply script stays ready and unrun. Move on.

## THE QUEUE
1. **B-31 THE A/R IS OVERSTATED — this is the owner's money, top priority.**
   110 live invoices, $381,916.72 billed, payment recorded on only 7, collected $15,507.60,
   open $366,409.12. His own Faro debtor-receipts export shows ~$28,000 received in September
   across 14 invoices. TRACE the chain: Faro receipt -> payment -> payment_application ->
   invoice.amount_paid_cents. NAME where it breaks. MEASURE ONLY — write nothing to accounting.
   Three receipts are SHORT PAYMENTS (DARDINI -2,500 and -1,000, CORE -250) and one is an
   unapplied -UC- pair netting zero. Say how each shape must post. A short pay is not a discount
   and must never silently write off a balance.
2. **B-32 THE DIESEL CARD** — /banking shows Dreamline Diesel Card at -$140,226.34 with 397
   uncategorized transactions, and Relay Fuel Wallet at -$32,726.45 with 76. Cash on hand reads
   -$21,042.31 across 8 real accounts. Establish what those balances actually represent and
   whether they are real liabilities or an unposted feed. Measure. Do not adjust.
3. **B-33 ATTRIBUTE THE EXISTING INTEGRITY ENGINE** — safety.integrity_findings holds 116 live
   rows written by a cron at 08:00 today (orphan_entry 46 / orphan_exit 46 / expected_missing 24,
   0 resolved, 10 units), every one keyed to unit_id with NO driver. Attribute them through
   driverAtTimeSql. Report how many resolve, by anomaly_class. Do NOT build a second findings
   table and do NOT rebuild the rules engine — safety.* already owns both.
4. **B-34 FACTORING RESERVE AND ESCROW** — Factoring Reserve $4,992.75 and Driver Escrow Pool
   $2,375.00 are VIRTUAL ledgers. Prove each ties to its real-world counterpart, or name the gap.
   Escrow shows 14 drivers; confirm that against driver_finance.
5. **B-35 QBO IS NOT CONNECTED** — /banking reports "QBO Sync: Not connected, no active
   QuickBooks connection, Last sync: n/a". Establish what breaks while it is disconnected, what
   reconnecting requires, and what would have to be re-synced. Report; do not connect.
6. **B-36** — when 1-5 are shipped, re-read this file. A new queue will be here.
