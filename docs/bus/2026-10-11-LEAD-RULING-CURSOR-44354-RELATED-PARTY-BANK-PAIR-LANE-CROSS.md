# LEAD RULING — CURSOR ACCT-F44354-7 related-party bank↔Relay SUGGESTED pairs + confirm, lane cross into CC-1 / CC-2

2026-10-11 · Cursor Lead · authorizes `LANE_CROSS` for this filename

## Why

Owner ROUND 443.54-7: Banking must offer read-only SUGGESTED pairs (personal-card Relay deposit ↔ bank OUT, same amount within 5 days) and a confirm path that books **one** `party_transfer_out` (Dr Due to/from / Cr bank) with **0** double post. Cursor owns Banking UI + bank-recon match wiring for this round; money math stays CC-1 engines already on tip (`party_transfer_out` / Due to/from).

Push is blocked without a written lane cross because the unique diff touches CC-1 `bank-recon/**`, CC-1 migrations/CLAIMED, CC-2 `banking/**`, and Cursor guards/gate skip for ambient LIVE_DOMAIN on bank-recon-only PRs (ROUND 443.29-B class).

## Scope (PR `cursor/bank-f44354-relay-match-paid-direct-c89b` / #26376 only)

- `apps/backend/src/accounting/bank-recon/match.service.ts`
- `apps/backend/src/accounting/bank-recon/related-party-card-map.ts`
- `apps/backend/src/accounting/bank-recon/related-party-pair-confirm.service.ts`
- `apps/backend/src/accounting/bank-recon/related-party-pair-suggestions.service.ts`
- `apps/backend/src/accounting/bank-recon/relay-deposit-categorized-match-hints.service.ts`
- `apps/backend/src/accounting/bank-recon/relay-deposit-match-math.ts`
- `apps/backend/src/banking/p7-wave2.routes.ts`
- `apps/backend/src/integrations/relay-payments/relay-deposit-post.service.test.ts` (test-only; no ingest rewrite)
- `apps/frontend/src/api/banking.ts`
- `apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx`
- `apps/frontend/src/pages/banking/components/RelatedPartyPairSuggestionsPanel.tsx`
- `apps/frontend/src/pages/banking/components/RelayDepositCategorizedMatchHintsPanel.tsx`
- `db/migrations/202615451400_relay_deposit_match_bucket_check_and_charged_cents.sql`
- `db/migrations/202615561540_related_party_loan_party_transfer_out.sql`
- `db/migrations/CLAIMED-MIGRATION-NUMBERS.json`
- `scripts/money-pr-local-gate.mjs` (ROUND_44329_B ambient SKIP + `verify-load-to-cash-chain`)
- `scripts/verify-related-party-bank-pair-suggestions.mjs`
- `scripts/verify-relay-deposit-is-a-bank-match-candidate.mjs`
- `scripts/verify-relay-fill-not-a-bank-match-candidate.mjs`
- `docs/MEMORY_BANK.md` / `docs/audit/USMCA-EXHAUSTIVE-BATTERY.md` (proof notes only)

No Book Load. No QBO write-back. No second loan poster on confirm. No agent categorize/match writes.

## Cite

`LANE_CROSS=2026-10-11-LEAD-RULING-CURSOR-44354-RELATED-PARTY-BANK-PAIR-LANE-CROSS.md`
