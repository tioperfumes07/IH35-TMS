# OUTBOX-DEVIN-A · RETIRED · 2026-09-02

**STALE PURGE (OWNER):** Every VERIFY / FE deploy / Cancel-walk line is **VOID**.

DEVIN-A is retired. Stop. No Book Load. No OUTBOX.

## DEVIN-A | REG-015 DONE | ff14176df9 | ff14176df9 | 51 advanced invoices, 0 debtor receipts, 0 unapplied cash, 64 invoice status rows, guard 11186 PASS | NEXT REG-046
- 6 dashed stubs → real read-only report tabs (debtor credit check, debtor receipts, loan/save, unapplied cash, invoice status, messages/support)
- 3 new backend endpoints + 3 new API functions + 3 new React Query hooks
- Fixed pre-existing selftest bug in verify-customer-factoring-reverse-section.mjs
- PR #21675 merged --admin --squash

## DEVIN-A | REG-046 DONE | 35a20f2852 | 35a20f2852 | column order = Invoiced Date→Settlement #→Delivery Date→Original Invoice Amount→Advance→Reserve→Fees, guard 11190 PASS | NEXT REG-043
- Invoice table columns reordered to money waterfall order
- Explanatory label added with "money waterfall" text
- PR #21678 merged --admin --squash

## DEVIN-A | REG-043 DONE | cad52f4b54 | cad52f4b54 | Chargebacks exclude=[advanced,factoring_fee,driver_pay,margin], manifest defaultHidden=true for revenue/costs/driver_pay/margin, guard 11194 PASS | NEXT REG-044
- Removed driver_pay and margin from Chargebacks & Fee History
- Profit and Trip-Expenses already OFF by default via manifest defaultHidden
- PR #21680 merged --admin --squash

## DEVIN-A | REG-044 DONE | 79def7cfff | 79def7cfff | 7 tabs have Summary/Detail toggles, dateRangeOnlyFilterBar on all data tabs, guard 11198 PASS | NEXT REG-045
- Added shared summaryDetailToggle helper + 6 new state variables
- Wired toggle to Account Summary, Aging, Chargebacks/Overpayments, Payment-To-You, Purchase Report, Faro Import
- PR #21683 merged --admin --squash

## DEVIN-A | REG-045 DONE | 2dfdfdd284 | 2dfdfdd284 | Monthly Fee Summaries stacked above Chargebacks detail, no side-by-side grid, guard 11202 PASS | NEXT REG-042
- Layout already fixed by NEW-24, added regression guard
- PR #21684 merged --admin --squash

## DEVIN-A | REG-042 DONE | 7460cc0f4a | 7460cc0f4a | overview row flex flex-wrap, KPI/profile flex-1 auto-size, Customer/Load+filter/gear same row, guard 11206 PASS | NEXT REG-047
- Changed fixed 7/5 grid to flex auto-sizing
- Updated FAC-07 guard to accept flex layout
- PR #21687 merged --admin --squash

## DEVIN-A | REG-047 DONE | d3427cd54a | d3427cd54a | Faro summary+detail views, date-range filter, reconciliation advance/reserve tie-out, guard 11210 PASS | NEXT NONE
- Added Faro summary view with aggregated totals (Gross, Advance, Reserve, Fees, Chargebacks, Batches)
- Added date-range filter (dateRangeOnlyFilterBar) to Faro imports section
- Added reconciliation section comparing Faro Advance/Reserve vs Factoring Summary
- PR #21690 merged --admin --squash
- ALL 7 REGS SHIPPED: 015, 046, 043, 044, 045, 042, 047

## DEVIN-A | FACTORING REVIEW | 2f526f4002 | 2f526f4002 | GPT REG-010/011 factoring changes reviewed — clean | NEXT (awaiting assignment)
- Reviewed GPT seat's REG-010/011 commit (2f526f4002) touching FactoringHome.tsx + loadCostColumnManifest.tsx
- Purchase Report + Aging tabs: added separate Load Number column (EntityLink kind=load), renamed Settlement # → Settlement/Tour (EntityLink kind=settlement)
- loadCostColumnManifest: Load → Load Number, Settlement # → Settlement/Tour, both alwaysVisible=true
- No conflicts with REG-043/044/046 money waterfall or default column work
- All 7 Devin A factoring REGs remain shipped and merged
