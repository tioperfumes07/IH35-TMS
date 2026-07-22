# OVERNIGHT HOLD — Jorge ~08:00 CT 2026-07-22

Chrome / catalog / creator burn-down continued without pause. Decisions below are **not blocking** UI chrome.

## HOLD (need Jorge)

1. **CC bill payment gate** — `CC_BILL_PAYMENT_GATED = true` in `CCPaymentModal` (ParityDrawer done; submit still gated).
2. **Account create financial gate** — InlineCreateDrawer account create remains ACCOUNT_CREATE_GATED.
3. **QBOBulkLinkPage** — keep QboCombobox (intentional QBO-id link UI). Confirm allowlist.
4. **DriverDetail / VehicleProfile “QBO vendor”** — still QboCombobox because fields store `qbo_vendor_id` (QBO id), not mdata vendor UUID. Migrating needs mapping via `vendor.qbo_id`.
5. **createKind="driver"** on ReferenceSelect — Cash advance + FineCreate use Combobox + CreateDriverModal instead (canonical creator). Optional future kind.
6. **Safety integrity defects** (accident persist, fine drill-through backend) — chrome fixed pickers; root-cause money/schema = separate evidence pass.
7. **GitHub attribution / machine account** — Houston morning pack.

## Shipped on PR #3197 (`fix/chrome-01-plus-01-creators`)

Linearized onto `origin/main` overnight:

- Filters: Safety + Customers + Vendors + UniversalFilterBar (`CollapsedListFilters`)
- Money +Create: Bill / Expense / JE / ItemEditor / CC pay / Cash GL / Rules / Transfers / Receive Payment / Invoice types
- Ops: WO vendor (id + outside), BookLoad customer, Factoring lender, Cash-advance +Create driver
- Safety: FineCreate driver Combobox+CreateDriverModal, CargoClaim customer+driver, AccidentReport vendor
- Insurance + Legal: Claim/Lawsuit/Policy creators + list filter collapse + guards
- Banking: CoA ReferenceSelect + Transfer/CC ParityDrawer
- Guards (Rule 17): `verify-safety-filter-chrome`, `verify-money-reference-select-plus`, `verify-qbo-filter-collapse`, `verify-insurance-legal-reference-select` + verify-steps 1230–1234

## Remaining (morning)

- Merge #3197 when CI green
- DriverDetail / VehicleProfile QBO vendor mapping (HOLD #4)
- Broader filter collapse on remaining DIRTY modules (Accounting lists, etc.)
- LIVE PROOF: deploy SHA + browser — **UNVERIFIED until merge/deploy**

PR: https://github.com/tioperfumes07/IH35-TMS/pull/3197
