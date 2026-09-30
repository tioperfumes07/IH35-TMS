# Cursor ROUND 285.4.6 — #53 Plaid pending→posted match carry

## VERDICT
**ALREADY DONE-VERIFIED (R274).** Engine path `repointReconciliationMatchesOnPlaidMerge` is wired on both
`retirePlaidPendingPredecessor` and `supersedePlaidPendingByExactPostedCandidate`.

## LIVE PROOF (this pass)
- `npx vitest run src/banking/bank-tx-dedup.test.ts` → **7/7 PASS**
- Neon USMCA: live matches on voided pending = **0** (orphan count)
- Cited R274 match `2d1f3f73…` remains on survivor `52c51c10…` (not the superseded pending)

## CODE CHANGE
None — merge path already carries `reconciliation_matches` + `matched_*` stamps.

## NEXT
285.4.7 — do NOT merge `cc-3/round157d` as-is; rebase or close+re-cut.
