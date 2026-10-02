# LEAD RULING — CURSOR B-1 settlement payout OnlineBankingMatchBanner, lane cross into CC-3 settlements.routes

2026-10-02 · Cursor Lead · authorizes LANE_CROSS for this filename

## Why

ORDERS-2026-10-01-BANKING-REGISTER-SET assigns B-1 Account Register to CURSOR end to end
(screen + route + read model). After B-1b→B-1j, register Edit already hops
`source_transaction_type=settlement` → `/driver-finance/settlements?settlement_id=…`, and
register ✓ already joins `banking.bank_transactions.matched_settlement_id`. The last missing
§5 piece is `OnlineBankingMatchBanner` on SettlementDetail — which requires a read-only
`matched_bank_*` projection on `GET /api/v1/driver-finance/settlements/:id` in
`apps/backend/src/driver-finance/settlements.routes.ts` (CC-3 lane per LANES.md).

Standing owner law 2026-10-01 (EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END) already says the seat that
owns the ORDERS engine finishes the route that completes it — no handoff. This ruling names the
one CC-3 file for verify-lane-ownership.

## Scope (this PR only)

- `apps/backend/src/driver-finance/settlements.routes.ts` — READ-ONLY matched_settlement_id reverse hop on GET detail (no settlement money math, no new posting).
- `apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx` — OnlineBankingMatchBanner (Cursor FE).
- `scripts/ops/verify-b1-online-banking-match-banner.mjs` — assert settlement surface.

No other `driver-finance/**` writes. Unmatch stays on existing `POST /bank-recon/unmatch`.

## Cite

`LANE_CROSS=2026-10-02-LEAD-RULING-CURSOR-B1-SETTLEMENT-MATCH-BANNER-LANE-CROSS.md`
