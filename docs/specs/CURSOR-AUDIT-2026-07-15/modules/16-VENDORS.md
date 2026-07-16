# 16 — VENDORS

**Verdict:** Canonical `/vendors` hub + detail exist with + Create Vendor and bill connectivity; arch design’s Maintenance/Fuel/Tow filter tabs and WOs/spend charts are thin or missing; maintenance has a separate vendor master that must stay (never delete) but needs clear linkage.

## Live evidence notes
**REPO-ONLY.** Verified from:
- Sidebar L117 → `/vendors`
- Routes: `apps/frontend/src/routes/manifest.tsx` L885–898; redirect `/accounting/vendors` → `/vendors` L3408–3411
- Hub: `apps/frontend/src/pages/Vendors.tsx`
- Detail: `apps/frontend/src/pages/VendorDetail.tsx` tabs Profile / A/P / Documents / Audit / Tasks / W-9·1099
- Create: `VendorCreateModal`
- Parallel surface: `/maintenance/vendors` (catalogs.maintenance_vendors) — B29, keep
- EntityLink vendor → `/vendors/:id` (`EntityLink.tsx` L80–81)

## Surface / button inventory

| Surface | Control | Route/behavior | Status |
|---------|---------|----------------|--------|
| Sidebar VENDORS | Nav | `/vendors` | HAVE |
| `/vendors` header | List / Master-detail | Pref toggle | HAVE |
| `/vendors` header | Active / Inactive / All | Soft-delete filter | HAVE |
| `/vendors` header | Category combobox | Dynamic from roster | HAVE |
| `/vendors` header | **+ Create Vendor** | `VendorCreateModal` (centered rich — KEEP) | HAVE |
| `/vendors` | `VendorsSyncPanel` | QBO sync read | HAVE |
| List view | Name Link | `/vendors/:id` | HAVE |
| Selected header | **Edit** | `/vendors/:id` | HAVE |
| Selected header | **New transaction** | `/accounting/bills?vendor_id=` | HAVE — `BillsPage` reads `vendor_id` (L174–175) |
| Tabs | Transaction List | Bills ParityTable | HAVE data / DRIFT columns Load#/Truck# = `"—"` |
| Tabs | Vendor Details | “shown in header” placeholder | DRIFT (thin) |
| Tabs | Notes | Public notes parse | HAVE (thin) |
| `/vendors/:id` | Profile Edit/Save/Cancel | Inline edit | HAVE |
| `/vendors/:id` A/P | **Record Bill Payment** | Bill payment chrome on vendor | HAVE (third payment UI — see Accounting audit) |
| `/vendors/:id` A/P | Bill EntityLink | `/accounting/bills/:id` | HAVE |
| `/vendors/:id` | W-9 / 1099 tab | Tax status + Documents cross-link | HAVE |
| `/vendors/:id` | Documents / Audit / Tasks | Surfaces present | MIXED |
| Arch tabs | Maintenance Vendors / Fuel / Tow / Settings | Design L609–618 | MISSING as hub filters |
| Arch KPI | Active / MTD Spend / Top5 / Open Bills / Avg Days | Design L620–621 | MISSING |
| Maintenance | `/maintenance/vendors` CRUD | Separate maintenance vendor master | HAVE (parallel; must keep) |
| Lists | `/lists/maintenance/vendors` | Links to maintenance vendors | HAVE |

## Connectivity to money/ops
- Bills list filtered by vendor_id from hub CTA — **works**.
- Detail A/P → bills + Record Bill Payment.
- Driver settlements treat drivers as vendors (ARCHITECTURE-BLUEPRINT §3) — separate from AP shop vendors; do not collapse.
- Hub Transaction List lacks bill EntityLink (unlike detail).
- Expense/WO linkage not surfaced on hub tabs (design promises WOs received / spend chart).

## HAVE / MISSING / DRIFT / WILL FAIL
**HAVE:** + Create Vendor modal; soft-delete roster; New transaction → bills filter; detail A/P + bill EntityLink; W-9 tab; redirects from accounting.
**MISSING:** Design filter tabs (Maintenance/Fuel/Tow); Settings (default terms/GL); KPI strip; WO history + spend chart on hub.
**DRIFT:** Only 3 hub tabs vs design 6; Vendor Details tab is a stub; trucking columns blank; maintenance vendors are a second master (intentional unify incomplete for operator clarity).
**WILL FAIL:** Operators expecting “Maintenance Vendors” tab on `/vendors` find nothing; may invent duplicate vendors in wrong master.

## Professional recommendation
Keep both `/vendors` (mdata.vendors / AP) and `/maintenance/vendors` (catalog) — never delete. Add hub filter chips that query category/source (maintenance WO usage, fuel brands, roadside) without removing QBO transaction chrome. EntityLink bills on hub Transaction List. Unify “New transaction” into QBO-like side-panel bill create with vendor prefilled (entry points stay). Document the two vendor masters in UI copy so AP vs shop catalogs cannot be confused.

## Deep button inventory (repo) — finish pass 2026-07-15

**Evidence root:** `apps/frontend/src/pages/Vendors.tsx` · `VendorDetail.tsx` · `BillsPage.tsx` · sidebar `sidebar-config.ts:117`

### Hub CTAs
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Sidebar VENDORS | `sidebar-config.ts:117` | `/vendors` | HAVE |
| **+ Create Vendor** | `Vendors.tsx:270` | `VendorCreateModal` centered | HAVE |
| **New transaction** | `Vendors.tsx:321-322` | `/accounting/bills?vendor_id=` | HAVE |
| `vendor_id` honor on bills | `BillsPage.tsx:174-175,198` | Server-side filter | HAVE |
| Hub tx Load#/Truck# etc. | `Vendors.tsx:195-200` | Hard-coded `"—"` | DRIFT / WILL FAIL theater |
| Detail tabs | `VendorDetail.tsx:45` | Profile / A/P / Documents / Audit / Tasks / W-9·1099 | HAVE |
| Record Bill Payment | `VendorDetail.tsx:889` | A/P chrome | HAVE |
| Bill EntityLink | `VendorDetail.tsx:1053` | `/accounting/bills/:id` | HAVE |
| Maintenance vendors parallel | `/maintenance/vendors` + Lists link | Separate master | HAVE — KEEP (never collapse-delete) |
| Arch Maintenance/Fuel/Tow filter tabs | Not on hub | | MISSING |

### Top WILL FAIL (new evidence)
1. **Design “Maintenance Vendors” tab missing on `/vendors`** — operators may invent wrong-master duplicates.
2. **Hub transaction trucking columns always “—”** — `Vendors.tsx:195-200`.
3. **Third bill-payment UI** on vendor detail vs Accounting — training ambiguity (KEEP all; clarify).

**Never delete** `/vendors` or `/maintenance/vendors` — document two masters in UI copy.
