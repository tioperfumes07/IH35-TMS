# QUEUE — CC-3 · CHROME A

OPEN:
1. GO-INSURANCE-BOUND (2026-08-31) items 8-10 — unit+trailer+driver schedules + coverage-status flag. BLOCKED, see DONE entry below for exact blockers (missing raw schedule data for 13/15 units + all 20 trailers + 10/13 drivers; insurance.policy rows not yet created by CC-1; no policy_driver table and I do not author migrations). Partial live-verification done — recheck once CC-1 posts policy IDs and/or the full schedule data surfaces.
2. Live-proof 5 navy URLs after Cascade converts a module

DONE:
- [x] Bank↔settlement match — Codex succeeded on its own (not a 30m miss): Neon-confirmed live `banking.bank_transactions` row `67ce5e7c-5c8d-405d-a742-c20bbc860c24` has `review_state='matched'`, `matched_journal_entry_id='ceb26c99-…'` set, tied to Settlement S-20260802-0258 per Codex's own PR #18833 commit message. No backup needed.
- [x] Future-JE unflagged=57 — independently Neon-confirmed (lucia bypass) `future_unflagged=0`, `future_sample=62`, exact match to Cursor's own closeout claim in CURRENT-GO.md. Cursor's fix, verified not built — no duplicate work needed.
- [x] Next unpaid bill pay hop — BILL-2026-00033 ($23.45, TEST CODEX ONBOARD, is_sample_data=true) paid via "Pay with CC" / Amex Credit Card Payable. Found+fixed 2 chained live P0 defects blocking 100% of CC bill-pay attempts: `CC-BILL-PAY-ACTIVE-COLUMN-500` (catalogs.accounts has no `active` column, PR #18815) and `CC-BILL-PAY-WRONG-CREDIT-CHECK-COLUMN` (eligibility gate checked account_type instead of account_subtype, PR #18819). Both merged, deployed live (healthz `8b5514b`), full hop Neon-confirmed (bills.status='paid', paid_cents=2345, new bill_payments row). Also filed sibling `BILL-PAY-RECORD-BUTTON-IGNORES-SELECTOR` (OPEN, different root cause, not fixed).
- [x] Multi-stop TEST load shape (3+ stops) — L-20260831-0015, PFL Logistics LLC, driver Rafael Rogelio Rivero Reynoso, 3 real stops (Laredo/San Antonio/Austin), sample=true, AT#=CC3TEST99002; also filed DRIVER-BILL-RATE-MINT-MISMATCH (real, unexplained rate discrepancy on the auto-created bill)
- [x] LOAD-DETAIL-MARK-IN-TRANSIT unblocked — L-0004 advanced to completed_docs_received on its own (root cause never found by me, fixed by someone else's deploy); also corrected a CC-2 finding that wrongly called my $75 lumper charge-line claim non-reproducing (was a Neon-MCP tool-role artifact — see GUARD-WORKORDERS)

- [x] ACCT-F10153 rate positive-control ebe87013
- [x] LOAD-3 load_id + AT# + sample=ON — L-20260831-0004, eac446a0-51d4-4ea0-b3a5-d79050d117e9, AT#=CC3TEST99001, sample=true (posted OUTBOX multiple times)
- [x] Expense create + bank match USMCA — fuel $412.50 + tolls $18.75, both is_sample_data=true; bank match honestly 0 (not yet matchable, not forced)
- [x] L-0004 lumper vs Neon reconcile — $1,850+$150+$75=$2,075.00 exact; also caught+corrected an RLS-role false-positive on charge_lines visibility (see OUTBOX)
