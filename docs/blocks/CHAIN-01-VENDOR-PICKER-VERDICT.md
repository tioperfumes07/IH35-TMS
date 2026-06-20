# CHAIN-01 — Vendor picker on Create Bill returns empty — diagnostic verdict

**Block:** AUTO-17 (LANE D · ACCOUNTING non-financial — reads/wiring only, posts nothing)
**Tracker:** CHAIN-01 (row 1109)
**Date:** 2026-06-18

## Symptom
The vendor picker on **Create vendor bill** (`VendorBillCreatePage` → `VendorBillForm`) shows only
"Select vendor…" — no vendors.

## Read path traced end-to-end — it is correct
1. **Form query** — `VendorBillForm` calls `listVendors({ operating_company_id: operatingCompanyId })`
   with `enabled: Boolean(operatingCompanyId)` (same call the working **Vendors** list page and
   **Create multiple bills** page use).
2. **API shape** — `listVendors` returns `{ vendors: VendorOption[] }`; the form reads
   `vendorsQuery.data?.vendors`. Shapes match.
3. **Backend** — `GET /api/v1/mdata/vendors` selects `vendor_name AS name`, returns
   `{ vendors: rows, total }`. The projection supplies both `id` and `name`, which is exactly what the
   picker maps to `{ value, label }`.
4. **Picker render** — options are passed as `<option>` children to `SelectCombobox`, whose
   `flattenOptions` walks `Children` and turns `child.type === "option"` into rows. Children rendering
   works; nothing is dropped.

There is **no read-code defect** in this path. It is byte-for-byte the same data flow as the Vendors
list and Create-multiple-bills surfaces.

## Root cause
The backend scopes vendors with `WHERE operating_company_id = $resolved`, and
`resolveOperatingCompanyId(requested)` returns the form's passed `operatingCompanyId` **verbatim**
(`if (requested) return requested`). So the picker shows exactly the vendors whose
`mdata.vendors.operating_company_id` equals the **operating company selected in the shell header**.

Therefore an empty picker means one of:
- **No operating company is selected** in the shell (the page already warns, but the picker itself was
  silent), or
- **No vendors carry that `operating_company_id`** — i.e. vendors exist under a *different* entity
  (e.g. created/imported under TRK or another company) than the one selected for the bill.

This is a **data-scoping condition, not a query bug**. "Fixing" it by widening the scope would be a
business/tenant decision (which entity's vendors may a bill be drawn against), not a read patch.

## What this block changed (safe, in-scope)
`VendorBillForm` no longer leaves the picker silently blank. It now shows an honest sub-label:
- no company selected → "Select an operating company to load vendors."
- loading → "Loading vendors…"
- read error → "Couldn't load vendors. Refresh to try again."
- zero rows → "No vendors found for this company. Create a vendor first, or check the selected company."

Posts nothing, touches no bill-posting path, no migration. When vendors **do** exist under the selected
company, the picker populates them (unchanged behavior).

## Gated next step (needs Jorge / prod read — §1.5)
Confirm where vendors actually live vs. the selected company:
```sql
-- gated prod read — ask before connecting
SELECT operating_company_id, count(*) FROM mdata.vendors WHERE deactivated_at IS NULL GROUP BY 1;
```
If the bulk of vendors sit under an entity other than the one bills are created for, the decision is a
scoping/business one (allow cross-entity vendor selection, or migrate vendor ownership) — **HOLD for
Jorge**, do not change scope unilaterally.
