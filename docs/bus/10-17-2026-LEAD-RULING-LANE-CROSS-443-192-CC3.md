# LEAD ruling — lane cross: 443.192 prod-data reds (CC-3, 2026-10-17)

Source (Lead channel ~/IH35-LEAD-CHANNEL/2026-10-10-LEAD-TO-SEATS.md, 08:55Z rulings — "CC-1 line authorized"):

> - ROUND 443.192 — PROD-DATA REDS (CC-3 after #26915; CC-1 line authorized): verify-pl-cost-of-revenue (delivery-evidence-latch.ts:82 revenue posts at "today", not the delivery date — CC-1's filed finding), verify-purge-era-closures-still-hold (3), verify-usmca-book-equals-faro-and-alwaystrack (21), verify-driver-bill-has-miles-and-rate (2 new bills). For each issue line: read-only measure, classify engine defect (fix at the engine + evidence re-stamp/restatement through the engine, audited, TB 0) vs owner decision (list it, do not change). DEADLINE 13:00 UTC.

Scope of the cross:
- apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts (+ __tests__/poster-earn-dated-by-evidence.test.ts), apps/backend/src/dispatch/delivery-evidence-latch.ts (comments)
- scripts/verify-pl-cost-of-revenue.mjs, scripts/verify-usmca-book-equals-faro-and-alwaystrack.mjs (+ scripts/lib/usmca-book-faro-checks.mjs, scripts/__tests__/usmca-book-faro-checks.test.mjs), scripts/verify-purge-era-closures-still-hold.mjs, scripts/verify-driver-bill-has-miles-and-rate.mjs
- writers named by the 443.192 measurement; scripts/verify-steps/18577 / 18581 / 18585 (claim #26922)
