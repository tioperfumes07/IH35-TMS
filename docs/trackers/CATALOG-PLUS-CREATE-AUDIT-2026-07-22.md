# Catalog “+ Create” / QBO nested-add audit — 2026-07-22

**Status:** IN PROGRESS (Detail Type dual-path fix shipping in same wave; full picker burn-down continues)  
**Owner law:** Every combobox that picks from a catalog must offer **+ Create** (or equivalent) that opens the existing creator/wizard — QuickBooks nested “+ Add new” — without leaving the form. Never delete surfaces; only add.

## Keystone (already built)

| Component | Role |
|---|---|
| `apps/frontend/src/components/parity/ReferenceSelect.tsx` | Software-wide **+ Add new** first row → `QuickCreateEntityModal` or service drawer |
| `QuickCreateEntityModal` | vendor / customer / item / category / part |
| Lists `+ Create` / AccountDrawer / DetailTypesListPage | Full catalog CRUD chrome |

**Rule:** Prefer `ReferenceSelect` over bare `<select>` / Combobox without create. New pickers must not invent a third pattern.

## Detail Type dual-path (this PR)

| Surface | Before | After |
|---|---|---|
| `NewAccountDrawerForm` (JE nested account) | Hardcoded `DETAIL_TYPES` | Live `fetchAccountTypeCatalog(opco)` |
| Accounting More | Account Type Catalog only | + **Detail Type** → `/lists/accounting/detail-types` |
| account-type-catalog API | No opco GUC | Optional `operating_company_id` → system + custom detail types |
| Guard | Lists wiring only | Also bans hardcoded `DETAIL_TYPES` + requires subnav + opco |

## TMS-wide picker burn-down (continue)

Priority order:

1. **Money** — bills/expenses/invoices/JE/banking categorize account & party pickers  
2. **Lists nested** — any catalog field on create drawers still using bare select  
3. **Ops** — dispatch/maintenance parts, vendors, units  

Track findings as rows below (update as audited):

| Module | Picker | Uses ReferenceSelect / + Create? | Notes |
|---|---|---|---|
| Accounting | CoA AccountDrawer category | Partial — detail type link to Lists | Live catalog |
| Accounting | JE NewAccountDrawerForm | Fixed this PR | Was hardcoded |
| Shared | ReferenceSelect kinds | HAVE | vendor/customer/item/category/part/service |
| TBD | (fill from explore audit) | | |

## Acceptance

- [ ] No `const DETAIL_TYPES` in NewAccountDrawerForm (CI)  
- [ ] Accounting → More → Detail Type opens CRUD list  
- [ ] Custom entity detail types appear in create pickers when opco passed  
- [ ] Tracker lists remaining bare catalog selects for follow-on PRs  
- [ ] Each follow-on PR adds `ReferenceSelect` (or documented exception) + guard growth  

## Related

- Dual-path audit: chat 2026-07-22 Detail Type  
- Guard: `scripts/verify-detail-type-catalog.mjs`, `scripts/verify-reference-select-catalog-plus.mjs`
