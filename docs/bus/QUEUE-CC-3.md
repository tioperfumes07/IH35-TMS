# QUEUE — CC-3 · CHROME A

OPEN:
1. Bank↔settlement match backup if Codex 30m Chrome miss
2. Live-proof 5 navy URLs after Cascade converts a module
3. Future-JE unflagged=57 — assist CC-2/CC-1: find amortization path that posts is_sample_data=false (Chrome repro URL)

DONE:
- [x] Next unpaid bill pay hop — BILL-2026-00033 ($23.45, TEST CODEX ONBOARD, is_sample_data=true) paid via "Pay with CC" / Amex Credit Card Payable. Found+fixed 2 chained live P0 defects blocking 100% of CC bill-pay attempts: `CC-BILL-PAY-ACTIVE-COLUMN-500` (catalogs.accounts has no `active` column, PR #18815) and `CC-BILL-PAY-WRONG-CREDIT-CHECK-COLUMN` (eligibility gate checked account_type instead of account_subtype, PR #18819). Both merged, deployed live (healthz `8b5514b`), full hop Neon-confirmed (bills.status='paid', paid_cents=2345, new bill_payments row). Also filed sibling `BILL-PAY-RECORD-BUTTON-IGNORES-SELECTOR` (OPEN, different root cause, not fixed).
- [x] Multi-stop TEST load shape (3+ stops) — L-20260831-0015, PFL Logistics LLC, driver Rafael Rogelio Rivero Reynoso, 3 real stops (Laredo/San Antonio/Austin), sample=true, AT#=CC3TEST99002; also filed DRIVER-BILL-RATE-MINT-MISMATCH (real, unexplained rate discrepancy on the auto-created bill)
- [x] LOAD-DETAIL-MARK-IN-TRANSIT unblocked — L-0004 advanced to completed_docs_received on its own (root cause never found by me, fixed by someone else's deploy); also corrected a CC-2 finding that wrongly called my $75 lumper charge-line claim non-reproducing (was a Neon-MCP tool-role artifact — see GUARD-WORKORDERS)

- [x] ACCT-F10153 rate positive-control ebe87013
- [x] LOAD-3 load_id + AT# + sample=ON — L-20260831-0004, eac446a0-51d4-4ea0-b3a5-d79050d117e9, AT#=CC3TEST99001, sample=true (posted OUTBOX multiple times)
- [x] Expense create + bank match USMCA — fuel $412.50 + tolls $18.75, both is_sample_data=true; bank match honestly 0 (not yet matchable, not forced)
- [x] L-0004 lumper vs Neon reconcile — $1,850+$150+$75=$2,075.00 exact; also caught+corrected an RLS-role false-positive on charge_lines visibility (see OUTBOX)
