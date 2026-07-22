# OVERNIGHT HOLD — for Jorge at ~08:00 CT 2026-07-22

Owner sleeping. Chrome / catalog / creator burn-down continued without pause.
Anything needing owner decision is listed here — **not blocking** UI chrome work.

## 2026-07-22 overnight — FineCreate UUID → driver Combobox + CreateDriverModal

DEFECT FIXED (frontend): FineCreateModal required raw driver UUID. Now uses
`listDrivers` Combobox + nested `CreateDriverModal` (+ Create) and ParityDrawer shell.

HOLD unchanged: createKind="driver" on ReferenceSelect (use Combobox + CreateDriverModal until kind exists).


1. **CC bill payment gate** — `CC_BILL_PAYMENT_GATED = true` in `CCPaymentModal`. UI now ParityDrawer; submit still disabled until financial-cluster OK.
2. **Account create financial gate** — InlineCreateDrawer account create remains ACCOUNT_CREATE_GATED (by design).
3. **QBOBulkLinkPage** — may keep QboCombobox intentionally (QBO-id link UI). Confirm allowlist.
4. **createKind="driver"** — Cash advance driver picker: no ReferenceSelect driver kind yet. HOLD until wizard extension.
5. **Safety integrity defects** (accident persist, fine drill-through) — chrome agents note; root-cause money/schema fixes need evidence + possibly Neon. Do not silent-patch.
6. **GitHub attribution / machine account** — deferred to Houston morning (owner pack).

## Shipped overnight (PR #3197 branch `fix/chrome-01-plus-01-creators`)

- CHROME-01 Safety Filters collapse + guard
- CHROME-02 Customers/Vendors CollapsedListFilters + UniversalFilterBar + Receive Payment ParityDrawer + guard 1232
- PLUS-01 money ReferenceSelect (Bill A/P/class, Expense payment, ExpenseCategoryMap, Record Payment customer)
- PLUS-02/03/04 batch: ManualJE account+class, ItemEditor all FKs, WO vendor, factoring lender, Cash GL, CategorizationRules, Transfer/CC ParityDrawer
- CHROME-12 continues: InvoiceCreate, CC bill pay, ManualJE → ParityDrawer
- Nested create via ReferenceSelect / InlineCreateDrawer / QuickCreate in ParityDrawer (not Modal-on-drawer)

## Still burning (agents + parent)

- Remaining QboCombobox: InvoiceTypeModalBase, BookLoad*, DriverDetail, VehicleProfile (+ QboCombobox.tsx + maybe QBOBulkLink)
- Safety / Insurance / Legal entity pickers + filter collapse
- Accounting SelectCombobox entity leftovers
- Banking reconcile / obligation pickers where CoA
- Desktop audit pack refresh under `~/Desktop/.../2026-07-22-CHROME/`

## PR

https://github.com/tioperfumes07/IH35-TMS/pull/3197

LIVE PROOF: UNVERIFIED until CI green + merge + deploy SHA.
