# UPDATE 2026-07-22 morning (owner GO)

- CC_BILL_PAYMENT_GATED → **false** (all companies)
- ACCOUNT_CREATE_GATED → **false** (all companies)
- QBOBulkLinkPage QboCombobox → **ALLOWLIST confirmed**
- Driver/Vehicle qbo_vendor_id → examples only; awaiting A/B/C
- createKind driver → exhaustive audit shipped; build waves next

See `OWNER-GO-FINANCIAL-GATES-2026-07-22.md`.

---

# OVERNIGHT HOLD — Jorge ~08:00 CT 2026-07-22

Chrome / catalog / creator burn-down continued without pause. Decisions below are **not blocking** UI chrome.

## HOLD (need Jorge)

1. **CC bill payment gate** — `CC_BILL_PAYMENT_GATED = true` in `CCPaymentModal` (ParityDrawer done; submit still gated).
2. **Account create financial gate** — InlineCreateDrawer account create remains ACCOUNT_CREATE_GATED.
3. **QBOBulkLinkPage** — keep QboCombobox (intentional QBO-id link UI). Confirm allowlist.
4. **DriverDetail / VehicleProfile “QBO vendor”** — still QboCombobox because fields store `qbo_vendor_id` (QBO id), not mdata vendor UUID. Migrating needs mapping via `vendor.qbo_id`.
5. **createKind="driver"** on ReferenceSelect — Cash advance + FineCreate + VendorBillForm use Combobox + CreateDriverModal instead (canonical creator). Optional future kind.
6. **Safety integrity defects** (accident persist, fine drill-through backend) — chrome fixed pickers; root-cause money/schema = separate evidence pass.
7. **GitHub attribution / machine account** — Houston morning pack.

## Shipped on PR #3200 (`fix/chrome-01-plus-01-creators`)

https://github.com/tioperfumes07/IH35-TMS/pull/3200

- ItemEditor Product & Service Categories create restored to `qboCategoriesCatalogClient.create` (NOT QuickCreate createKind=category / CoA) — unblocks `verify:product-service-categories`
- CHROME-03: Bills / Expenses / Invoices / Payments / Manual JE / Bill Payments / Factoring / Transaction Register / Fixed Assets / Prepaid / Daily Recon / AP Aging → CollapsedListFilters
- CHROME-06: Transfers, Arriving Soon, AssetFilters, settlement disputes, dispute queue
- CHROME-07 start: profitability FilterBar + report RunnerFilters
- CHROME-10: CostBreakdownBox nested amount borders flattened
- VendorBillForm driver → Combobox +CreateDriverModal
- Banking Workflow-B archived forms vendor → ReferenceSelect
- Guards: verify-qbo-filter-collapse extended; entity-link baseline refreshed as needed
- CHROME filters continued: RevRec, Trip Profit, Audit Trail, Anomalies, Items, Docs, Integration TX, Abandonment, Receipts, POD, Border, AP Aging, …

## Remaining (morning)

- Claude coder: merge #3200 when CI green (Cursor does **not** merge)
- DriverDetail / VehicleProfile QBO vendor mapping (HOLD #4)
- Broader filter collapse on remaining DIRTY modules (POD / Border / more reports)
- LIVE PROOF: deploy SHA + browser — **UNVERIFIED until merge/deploy**
