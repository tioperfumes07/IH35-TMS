# AUTO-08 — Per-load profitability: VERIFY verdict

**Verdict: COVERED — DONE-verify. No build needed.** Per-load profitability is already built.

## Evidence (repo)
- **Backend:** `apps/backend/src/dispatch/load-profitability.service.ts` + `load-profitability.routes.ts` —
  a per-load profitability computation/endpoint.
- **Reporting view:** `apps/frontend/src/pages/dispatch/TripProfitability.tsx` — "Company Settlement Report /
  Trip Profitability" at `/reports/trip-profitability`, reads `GET /api/v1/reports/trip-profitability`,
  with margin % per row (`marginClass`), sortable columns (`SortKey = keyof TripProfitabilityRow`).
- **Lib:** `apps/frontend/src/lib/loadProfit.ts` (`getTripProfitability`, `TripProfitabilityRow`).
- Lane profit (#375) + the W2A profitability engine (#871) shipped previously; this layer adds the per-load/per-trip view.

## Residual (NOT built here)
A dedicated per-load **drawer child on the dispatch board** (SettlementProfitabilityCard) was noted in the tracker as
a nice-to-have. The data + report view exist; surfacing it as an inline board drawer is a small future UI add, not a
gap in the profitability data itself. No build in this verify block.
