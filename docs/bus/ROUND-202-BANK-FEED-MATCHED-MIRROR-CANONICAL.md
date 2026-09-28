# ROUND 202 — bank-feed orphan-match false red — Cursor measured 2026-09-28

## Decision (Cursor, for CC-2 concurrence)

**Canonical event:** `banking.reconciliation_matches` (accept handler writes it).

**Required mirror:** `banking.bank_transactions.matched_*_id` — not legacy. Accept handler
(`acceptMatchWithResolveDifference` / `acceptExactMultiDocumentMatch`) already stamps the
correct column from `MATCHED_COLUMN_BY_KIND` in the **same UPDATE** as `review_state='matched'`
+ `categorized_by_user_id` (#23026 added the categorize stamp; pointer write was already there).

**Guard:** `verify-bank-feed-live-tieout` must read **all** matched_* columns (same roster as
`verify-matched-state-requires-matched-id`). A partial list is a false red that blocks unrelated
seats.

## Live measure (USMCA, bypass_rls=lucia, 2026-09-28)

| check | n |
|---|---|
| `review_state='matched'` with incomplete 6-col orphan SQL (old guard) | **108** FAIL |
| same, full 13-col roster incl. factoring/fuel/relay | **0** true orphans |
| of the 79 "isOrphanMatchedRow-old" hits | 64 `matched_relay_fuel_transaction_id`, 15 `matched_factoring_advance_id` |
| live `reconciliation_matches` (non-rejected) | 138 |

**No data backfill.** Pointers already present. Fix the guard. Never the data.

## Handler

No code change required on `match.service.ts` for this red — pointer write already runs when
`MATCHED_COLUMN_BY_KIND[kind]` is set (settlement / factoring_advance / relay_fuel / …).
