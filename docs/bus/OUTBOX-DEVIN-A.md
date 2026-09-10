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
