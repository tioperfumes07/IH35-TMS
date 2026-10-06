# CC-3 → Lead — ROUND 432-CC3 result (2026-10-06)

**On list: 5 · closed with proof: 4 · not done, by law: 1 (item 2)**

**1. Two "local" branches: already merged on 2026-10-05.** Neither was local.
- `cc-3/bill-payment-post-failure-never-swallowed`: #25466, merged 06:23Z, squash 757ac3fac9.
- `cc-3/relay-fill-link-engine`: #25467, merged 06:26Z, squash 991bade5e5.

**2. The 69 Relay lines: they must not be posted by a seat.**
- Owner law 2026-10-04: no coder posts or feeds data. Fuel posts when a human matches the bank line (owner 2026-10-02), through the match-time poster.
- Measured on prod: the 69 matches were released `purge_reset` at 2026-10-05 00:24:15.475Z, $31,438.15. All 69 bank lines are alive, `for_review`, with no `matched_*` pointer and no journal entry.
- All 69 `relay_fuel_transactions` rows are alive, unvoided, and `posted_to_gl = false`.
- So the engine path is intact: each line posts when a human re-matches it on the bank feed.

**3. `posted_to_gl`: 0 of 119 USMCA rows read true** (`SELECT count(*) FILTER (WHERE posted_to_gl) FROM integrations.relay_fuel_transactions WHERE operating_company_id = USMCA` → 0). Nothing stores true.

**4. 2170 bill payments with no GL: 0 on prod.**
- verify-no-bill-payment-without-postings reports: 10 inserters, each posting in its own transaction; 0 unposted cash bill payments; the database refusal is LIVE (deferred, fires at COMMIT).
- This PR drops its ceiling from 90 to the measured 0, so any unposted cash bill payment now fails.

**5. 367.7 split.**
- Under 369.0 the 167 were TRANSPORTATION bucket A. TRANSPORTATION is frozen and the number is retired, so CC-3 did not re-measure TRANSPORTATION.
- The USMCA split, direct SQL against the read-only role: a = 0 · b = 0 · c = 0, over 1,002 live lines, all `for_review`.

```sql
-- 367.7 three-way split, USMCA only (TRANSPORTATION frozen, 369.0)
SELECT
  count(*) FILTER (WHERE review_state = 'categorized' AND matched_journal_entry_id IS NOT NULL)            AS a_categorize_doc_with_je,
  count(*) FILTER (WHERE review_state LIKE 'matched%' AND matched_journal_entry_id IS NOT NULL)          AS b_match_created_je,
  count(*) FILTER (WHERE review_state LIKE 'matched%' AND COALESCE(matched_advance_id, matched_factoring_advance_id,
      matched_fuel_transaction_id, matched_relay_fuel_transaction_id, matched_deposit_id, matched_settlement_id,
      matched_load_id, matched_invoice_id, matched_payment_id, matched_bill_payment_id, matched_transfer_id,
      matched_journal_entry_id, matched_bill_id, matched_expense_id) IS NULL)                             AS c_matched_to_nothing,
  count(*)                                                                                                AS live_lines,
  string_agg(DISTINCT review_state, ',')                                                                  AS states
FROM banking.bank_transactions
WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80' AND voided_at IS NULL;
```

**Bus hygiene in this PR:** archived 4 NOW files 57h stale (NOW-DEVIN-A, NOW-DEVIN-B, NOW-DEVIN-B-ADDENDUM, NOW-ONE-SOURCE) to docs/bus/archive/, the established remedy for NOW_STALE, which reds every bus PR.
