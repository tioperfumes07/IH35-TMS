# Design Decisions Locked

| Module | Status | Source | Reference |
|---|---|---|---|
| Accounting | LOCKED 2026-05-18 | MOD.acctg in `docs/ih35-tms-prototype.html` | PR #103 |
| Dispatch | LOCKED 2026-05-18 | MOD.dispatch in `docs/ih35-tms-prototype.html` | PR #109 |
| Customers | LOCKED 2026-05-18 | left-rail list + entity detail + txn table per `docs/approved-screens` 7.21.19 / 7.20.22 | PR #108 |
| Vendors | LOCKED 2026-05-18 | same layout per 7.49.39 / 7.49.50 / 7.49.56 | PR #108 |
| Book Load wizard | LOCKED 2026-05-18 | `docs/ih35-dispatch-load-wizard.html` | fix/book-load-wizard-correct-design |
| Banking Home | LOCKED 2026-05-18 | source: `docs/approved-screens/4-Banking_Homepage.png` | PR #111 |
| Drivers | LOCKED 2026-05-18 | `docs/approved-screens/7-Drivers.png` | PR #107 |
| Banking Transactions | LOCKED 2026-05-18 | `docs/ih35-banking-transactions.html` | PR #105/#106 |
| Bill form | LOCKED 2026-05-18 | 12x6 grid + Cost Breakdown Box per `02_PRODUCTION_CLEAN_v6_3.html` + master Excel | PR #112 |
| Expense form | LOCKED 2026-05-18 | same source | PR #112 |
| Bill Payment form | LOCKED 2026-05-18 | same source | PR #112 |
| Bill form | LOCKED 2026-05-18 | 12x6 header grid + Cost Breakdown Box per `02_PRODUCTION_CLEAN_v6_3.html` + `IH35TMSMASTERRULESLOCKED20260507.xlsx` | feat/bill-expense-payment-forms |
| Expense form | LOCKED 2026-05-18 | 12x6 header grid + Cost Breakdown Box per `02_PRODUCTION_CLEAN_v6_3.html` + `IH35TMSMASTERRULESLOCKED20260507.xlsx` | feat/bill-expense-payment-forms |
| Bill Payment form | LOCKED 2026-05-18 | payment-application form per `02_PRODUCTION_CLEAN_v6_3.html` | feat/bill-expense-payment-forms |
| Banking Transactions | LOCKED 2026-05-18 | QBO-parity transactions tab: account chips, For review/Categorized/Excluded sub-tabs, filter bar, grouped table, detail panel, transaction-type filter, gear view menu, print/export | feat/banking-transactions-qbo-parity |
| Sidebar (owner-directed) | LOCKED 2026-05-18 | Added FUEL + DRIVERS left-sidebar entries while preserving all existing navigation entries/routes (F.24) | fix/wizard-nav-pagination-profiles-batch |
| Factoring profile (owner-directed) | LOCKED 2026-05-18 | Active factoring company profile is editable and persisted (reserves, fees, aged advance/fee %, contacts) | feat/factoring-customer-vendor-quality |
| Customer quality rating (owner-directed) | LOCKED 2026-05-18 | Automatic Good/Watch/Late-pay pill rendered from quality payment signals on list + profile; FMCSA standing surfaced on profile | feat/factoring-customer-vendor-quality |
| Vendor quality rating (owner-directed) | LOCKED 2026-05-18 | Manual Good/Medium/Bad vendor rating persisted on profile and shown on list + profile; maintenance re-do warning surfaced from integrity feed | feat/factoring-customer-vendor-quality |
| Dispatch factoring package (owner-directed) | LOCKED 2026-05-18 | Delivered/closed loads auto-generate factoring package summary PDF view (rate confirmation, POD/BOL, invoice) with email/mark-uploaded actions | feat/factoring-customer-vendor-quality |
