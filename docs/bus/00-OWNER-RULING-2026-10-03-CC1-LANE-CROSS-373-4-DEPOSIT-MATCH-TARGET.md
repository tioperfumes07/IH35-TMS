# OWNER RULING — 2026-10-03 — CC-1 CROSSES INTO THE BANK-FEED MATCH ENGINE FOR THE DEPOSIT (373.4)
Recorded by CC-1 · authority: ROUND 373.4 (Lead: "Deposit … the ability to be matched in the bank feed … Deposits go
before the purge — the sweep poster cannot be removed under 369.4 until the deposit document exists to replace it",
assigned CC-1) · ROUND 366.5 (owner amendment: no hand-offs, build both halves) · owner chat 2026-10-03 ("the deposit is
the missing fifth step of the accrual chain")

**Cite this filename in `LANE_CROSS=` and in the PR body.**

## What is crossed

| File / object | Owner | Change |
|---|---|---|
| `apps/backend/src/banking/bank-line-state-machine.service.ts` | CC-2 | release set clears `matched_deposit_id` |
| `apps/backend/src/banking/bank-tx-dedup.ts` | CC-2 | merge keeps `matched_deposit_id` |
| `apps/backend/src/banking/bank-feed-gl-posting.service.ts` | CC-2 | a deposit-matched line counts as having its document (never re-posted) |
| `banking.bank_line_classify`, `bank_line_match_pointers`, `bank_line_dead_link`, `refuse_bank_line_matched_to_nothing`, `refuse_live_match_row_on_released_line`, `reconciliation_matched_ledger_amount_cents` | CC-2 (360 / 368.2(b)) | restated from production's live definitions with exactly one addition: the deposit link |
| `apps/frontend/src/api/banking.ts`, `pages/banking/components/MatchDrawer.tsx`, `BankingTransactionsDesignView.tsx` | SHARED | the `deposit` candidate kind (label, chip, drill) |
| `scripts/verify-unmatch-clears-both-sides.mjs`, `scripts/verify-banking-match-qbo-engine.mjs` | CC-1 | re-pointed to 363-CC3-B / 369.2 (both red on main) |

## What the owning seat must not change back

`matched_deposit_id` is a bank-line match column like the other thirteen: every list that enumerates them includes it,
and the matched-to-nothing refusal checks it. A payment or factoring advance on a live deposit is matched through the
deposit, never directly. The match to a deposit posts nothing. The lane returns to its owner when the PR merges.
