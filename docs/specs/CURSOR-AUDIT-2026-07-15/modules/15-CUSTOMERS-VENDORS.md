# 15 — CUSTOMERS & VENDORS (deep audit)

**Scope:** Repo research only (no product code changes). Live UI not exercised this pass — mark live gaps as “repo-proven; live confirm pending.”  
**Standards bar:** QuickBooks Online Customers/Vendors + NetSuite Customer/Vendor master + McLeod/Alvys party drill-through.  
**Date:** 2026-07-15  
**Repo:** `/Users/jorgemunoz/IH35-TMS`

---

## 1. Verdict

**GAP → BLOCK (both modules).** Customers and Vendors have real roster + detail surfaces, QBO clone sync, and strong detail-page A/R and A/P payment tooling — but master-detail transaction grids lack invoice/bill drill-through, Customer “New transaction” deep-links are dead (`?customer_id=` unread), architectural-design tab/KPI contracts are largely unmet, and Quick Create Customer omits required `customer_type` (API 400). A CPA would not trust the QBO-lookalike chrome until transaction linkage and statement/aging surfaces are honest end-to-end.

---

## 2. Surface / button inventory

| Surface | Control | Route / behavior | Status |
|---------|---------|------------------|--------|
| Sidebar | CUSTOMERS | `/customers` (`sidebar-config.ts` ~116) | HAVE |
| Sidebar | VENDORS | `/vendors` (`sidebar-config.ts` ~117) | HAVE |
| Redirect | Accounting aliases | `/accounting/customers` → `/customers`; `/accounting/vendors` → `/vendors` (`manifest.tsx` ~3408–3419) | HAVE |
| Route | Customer list | `/customers` → `CustomersPage` | HAVE |
| Route | Customer detail | `/customers/:id` → `CustomerDetailPage` | HAVE |
| Route | Vendor list | `/vendors` → `VendorsPage` | HAVE |
| Route | Vendor detail | `/vendors/:id` → `VendorDetailPage` | HAVE |
| Route | Maint. vendors (separate) | `/maintenance/vendors`, `/lists/maintenance/vendors` | HAVE (separate catalog; not Module 10 tab) |
| Customers header | List / Master-detail toggle | `useViewModePref("customers")` | HAVE |
| Customers header | Active / Inactive / All | Soft-delete filter on `deactivated_at` | HAVE |
| Customers header | Type filter | broker / direct_shipper | HAVE |
| Customers header | Credit status filter | active / inactive / credit_hold / blacklist | HAVE |
| Customers header | **+ Create Customer** | Opens centered modal `modalKind="customer-create"` | HAVE |
| Customers | QBO sync: Refresh / Reconcile / Retry | `CustomersSyncPanel` → `/api/v1/qbo-sync/customers/*` | HAVE |
| Customers list view | Search + quality chips | All / Late-pay / Medium / Active / Has overdue / With open | HAVE |
| Customers list view | Row click | Switches to master-detail selection | HAVE |
| Customers list view | Name `Link` | `/customers/:id` | HAVE |
| Customers list view | **View** (quick drill) | `CustomerDrillModal` (read-only summary; no “Open full”) | DRIFT |
| Customers list view | Bulk Tag Late-pay / Medium / Active | `bulkUpdate` classify | HAVE |
| Customers list view | Bulk Deactivate | `set_status` inactive | HAVE |
| Customers list view | Export CSV | Client Blob download | HAVE |
| Customers master-detail | Sidebar search / sort / pager | `CustomerListSidebar` | HAVE |
| Customers master-detail | **Edit** | `navigate(/customers/:id)` | HAVE |
| Customers master-detail | **New transaction** | `navigate(/accounting/invoices?customer_id=…)` | **WILL FAIL** (param unread) |
| Customers master-detail | Shipping address / Custom fields | Hardcoded `—` | DRIFT / MISSING |
| Customers master-detail | Open balance / Overdue | Billing summary API | HAVE |
| Customers MD tabs | Transaction List | Invoices via `listInvoices` | HAVE (grid; no row drill) |
| Customers MD tabs | Activity Feed, Statements, Recurring, Projects, Late Fees, Notes, Tasks, Opportunities, Conversations | `CustomerTabComingState` copy only | MISSING |
| Customers MD tabs | Customer Details | Wired fields + Edit → detail | HAVE |
| Customers MD tabs | COI Requests | `CustomerCOITab` | HAVE |
| Customers MD tx filter | Type / Filter / Status / Dates / Category | Local state | HAVE |
| Customers MD tx columns | Settlement/Truck/Pickup/Delivery/Miles | Always `—` (hidden by default) | DRIFT (cosmetic placeholders) |
| Customers create modal | Cancel / Save | `createCustomer` → navigate detail | HAVE |
| Customers create modal | `CustomerProfileForm` | Full QBO-style sections incl. shipping / terms / Option-B income acct | HAVE |
| Customer detail | Inactivate / Reactivate | Soft delete | HAVE |
| Customer detail | Edit / Full Edit / Save | Inline edit + `CustomerEditModal` | HAVE |
| Customer detail | Verify FMCSA / SAFER | Modals + mutations | HAVE |
| Customer detail tabs | Profile, Contacts, Billing & Receivables, Quality & History, Lanes & Pricing, Documents, COI, Contracts, Portal Users, Tasks, Loads, Per-Customer P&L, Audit History | 13 tabs | HAVE (detail) / DRIFT vs arch Module-8 list tabs |
| Customer detail | + Create Contact / Edit / Deactivate / Reactivate | Contact modals | HAVE |
| Customer detail | + Create Event / Edit Details / Void | Quality events | HAVE |
| Customer detail | + Create Lane / Edit / Deactivate | Lane modals | HAVE |
| Customer detail | Record Payment / Unapply | Customer payment apply to invoices | HAVE |
| Customer detail | Invoice rows | `EntityLink kind="invoice"` + navigate detail | HAVE |
| Customer detail | Factoring company vendor | `EntityLink kind="vendor"` | HAVE |
| Customer detail | Parent / sub-customer links | `navigate(/customers/:id)` | HAVE |
| Customer detail | `?tab=billing` | Opens Billing & Receivables | HAVE |
| Deep link | AR Aging → `/customers/:id?tab=billing` | Honored | HAVE |
| Vendors header | List / Master-detail | `useViewModePref("vendors")` | HAVE |
| Vendors header | Active / Inactive / All | `deactivated_at` | HAVE |
| Vendors header | Category roster filter | Dynamic `vendor_category` | HAVE |
| Vendors header | **+ Create Vendor** | `VendorCreateModal` (`wide`, **no** `modalKind`) | HAVE / DRIFT (chrome) |
| Vendors | QBO sync panel | `VendorsSyncPanel` | HAVE |
| Vendors list view | Search + Active / 1099 / With open chips | | HAVE |
| Vendors list view | Name `Link` | `/vendors/:id` | HAVE |
| Vendors list view | Bulk Deactivate / Export CSV | | HAVE |
| Vendors list view | Quick-view modal | None (customers have one) | MISSING (parity) |
| Vendors master-detail | **Edit** | `navigate(/vendors/:id)` | HAVE |
| Vendors master-detail | **New transaction** | `navigate(/accounting/bills?vendor_id=…)` | HAVE (`BillsPage` reads param) |
| Vendors MD tabs | Transaction List / Vendor Details / Notes | Only 3; Details is stub text | DRIFT / MISSING |
| Vendors MD tx | Type filter only `bill`; placeholder trucking cols `—` | | DRIFT |
| Vendors MD | Bill Pay ACH info | Heuristic: notes text includes `"ach"` | DRIFT (not trustworthy) |
| Vendors create | Full QBO-ish form + terms + default expense acct | `VendorCreateModal` | HAVE |
| Vendor detail | Inactivate / Reactivate | Soft delete | HAVE |
| Vendor detail | Profile Edit / Save / Cancel | Inline profile | HAVE |
| Vendor detail | Verify SAFER | | HAVE |
| Vendor detail tabs | Profile, A/P, Documents, Audit History, Tasks, W-9 / 1099 | 6 tabs | HAVE / DRIFT vs arch (no WOs/Spend chart tabs) |
| Vendor detail A/P | Record Bill Payment + allocation | `recordVendorBillPayment` | HAVE |
| Vendor detail A/P | Bill # | `EntityLink kind="bill"` | HAVE |
| Vendor detail | `?tab=ap` | Opens A/P | HAVE |
| Vendor detail | Category patch | `patchVendorAccountingCategory` | HAVE |
| Nested create | `QuickCreateEntityModal` vendor/customer | From `ReferenceSelect` / banking / WO | HAVE vendor; **WILL FAIL** customer (no `customer_type`) |
| Nested create | `NewCustomerDrawerForm` / `NewVendorDrawerForm` | `InlineCreateDrawer` | HAVE (customer_type enforced) |
| EntityLink | `customer` → `/customers/:id` | `EntityLink.tsx` 82–83 | HAVE |
| EntityLink | `vendor` → `/vendors/:id` | `EntityLink.tsx` 80–81 | HAVE |
| Arch design KPIs | 5 customer / 5 vendor KPI cards | Not on list pages | MISSING |
| Arch Module 8 tabs | All Customers, By Quality Flag, Pending FMCSA, Disputes, Factoring Config, Scoring, Settings | Not implemented as module sub-nav | MISSING / DRIFT |
| Arch Module 10 tabs | Maintenance / Fuel / Tow filters + Settings | Not on `/vendors` | MISSING / DRIFT |

---

## 3. HAVE / MISSING / DRIFT / WILL FAIL (with evidence)

### HAVE
- Sidebar routes and protected routes for `/customers`, `/customers/:id`, `/vendors`, `/vendors/:id` — `apps/frontend/src/components/layout/sidebar-config.ts:116-117`, `apps/frontend/src/routes/manifest.tsx:869-898`.
- Canonical create CTAs **+ Create Customer** / **+ Create Vendor** — `Customers.tsx:435-437`, `Vendors.tsx:269-271`.
- Customer create uses centered rich modal + shared `CustomerProfileForm` (`modalKind="customer-create"`, `sizePreset="xl"`) — `Customers.tsx:597-645`, `CustomerProfileForm.tsx:1-18`.
- Vendor create is a wide modal with Name/Address/Classification/Terms/1099 — `VendorCreateModal.tsx:233-353`.
- QBO parallel-books clone panels (pull + reconcile, no write-back UI) — `CustomersSyncPanel.tsx:37-123`, `VendorsSyncPanel.tsx:38-125`.
- Soft-delete Active/Inactive/All + roster filters — `Customers.tsx:270-280`, `Vendors.tsx:96-103`.
- Customer detail financial ops: Record Payment, invoice `EntityLink`, aging, factoring vendor link — `CustomerDetail.tsx:1876-2116`, `1855`.
- Vendor detail A/P: Record Bill Payment, bill `EntityLink`, W-9/1099 tab — `VendorDetail.tsx:887-1053`, tabs at `44-46`.
- Bills deep-link `?vendor_id=` honored — `BillsPage.tsx:174-175`, emitted from `Vendors.tsx:321`.
- AR Aging deep-link `?tab=billing` honored — `ARAgingPage.tsx:216`, `CustomerDetail.tsx:356-358`.
- EntityLink kinds `customer`/`vendor` resolve correctly — `EntityLink.tsx:80-83`.

### MISSING
- Module-level architectural tabs (Customers 8 / Vendors 6) and KPI rows — design `IH35_ARCHITECTURAL_DESIGN.md:480-494`, `:609-621`; list pages implement QBO-style secondary tabs instead, without KPI cards.
- Nine Customer master-detail tabs are explicit coming-soon states (Activity Feed, Statements, Recurring, Projects, Late Fees, Notes, Tasks, Opportunities, Conversations) — `Customers.tsx:133-143`, `585-588`.
- Vendor detail: WOs received, Spend chart (arch `IH35_ARCHITECTURAL_DESIGN.md:623-624`); integrity only as banner count, not a tab — `VendorDetail.tsx:429-432`.
- Customer list Quick View has no “Open customer” CTA — `CustomerDrillModal.tsx:17-53`.
- Vendor list has no quick-view modal (asymmetry with customers).
- No expense create/list entry from Customer/Vendor modules (expenses are Accounting-only) — expected for QBO (Expenses ≠ Customers), but no reverse EntityLink from expense (expense kind returns `null` — `EntityLink.tsx:100-101`).

### DRIFT
- Implemented Customer MD tabs (12 QBO-ish labels) ≠ architectural Module 8 tab set — `Customers.tsx:46-59` vs design `:482-491`.
- Vendor MD only 3 tabs; Vendor Details tab is non-content stub — `Vendors.tsx:26-30`, `389-392`.
- Shipping address shown as `—` on MD header while create form collects structured shipping — `Customers.tsx:505` vs `CustomerProfileForm.tsx:651-665`.
- Vendor ACH display is notes-string heuristic — `Vendors.tsx:36-39`, `333`.
- Vendor create chrome: `wide` without `modalKind`/`sizePreset` (customers use preferred-size chrome) — `VendorCreateModal.tsx:234` vs `Customers.tsx:597`.
- Trucking columns present but always em-dash — `Customers.tsx:355-359`, `Vendors.tsx:195-200`.
- Maintenance vendors live under `/maintenance/vendors` (catalog) while arch lists “Maintenance Vendors” as a Vendors module tab — design `:615`, routes `manifest.tsx:1766+`.
- Parallel create paths: full modal vs `QuickCreateEntityModal` vs `New*DrawerForm` — field completeness differs.

### WILL FAIL
1. **Customer “New transaction” deep link dead.**  
   Emit: `Customers.tsx:496` → `/accounting/invoices?customer_id=…`  
   Consume: `InvoicesListPage.tsx:66` initializes `customerId` to `""` and **never** calls `useSearchParams`. Result: unfiltered invoice list; no auto-open create.  
   Contrast: vendor path works (`BillsPage.tsx:175`).

2. **Quick Create Customer API rejection.**  
   `QuickCreateEntityModal.tsx:164-172` calls `createCustomer` without `customer_type`.  
   Backend requires it: `apps/backend/src/mdata/customers.routes.ts:121-122` (`.refine(... customer_type is required)`).  
   Nested “+ Add new” customer from banking/expense/reference flows will 400.  
   `NewCustomerDrawerForm.tsx:71-74` correctly enforces type — proving the split-brain.

3. **Master-detail transaction grids are dead-ends.**  
   Customer/Vendor `ParityTable` has no `onRowClick` and Doc # is not `EntityLink` — `Customers.tsx:522-571`, `Vendors.tsx:348-388`.  
   Violates Law of the Land total-connectivity; CPA cannot click Doc # to the invoice/bill.  
   Detail pages *do* link correctly — inconsistency is the failure mode.

4. **Placeholder financial columns if toggled on.**  
   Settlement/Truck/Pickup/Delivery/Miles always `—` — looks like missing load linkage, not “not wired.” CPA/auditor risk if operators treat blank as zero/N/A without knowing.

---

## 4. CPA / auditor review failures

- **Statements tab is marketing chrome** (coming soon) while QBO/NetSuite treat customer statements as a core A/R control — cannot produce customer statement from Customers module.
- **Open balance on list vs aging:** list open balance aggregates invoice open cents; overdue on MD uses `bucket_91_plus` only (`Customers.tsx:340`) — not full 1–30/31–60/61–90 presentation on the list surface (detail billing tab is richer).
- **ACH “on file” from notes text** is not an auditable payment-method record — false positive/negative risk for Bill Pay.
- **1099 eligibility** exists on vendor create/list; W-9 tab is display/drill — confirm document completeness before year-end (not verified live this pass).
- **Parallel books:** Sync UI correctly frames clone+reconcile (no TMS→QBO write-back) — aligns with locked Decision #5; good for auditor narrative if exceptions counts are acted on.
- **Quick-create customer 400** creates silent operator failure when creating payees mid-transaction — classic “orphan attempt / retry under wrong entity” risk.

---

## 5. Professional recommendation (correct path, not patch)

1. **Close deep-link + create-path integrity first (financial trust):**  
   - Honor `?customer_id=` on `InvoicesListPage` (mirror `BillsPage` vendor_id). Optionally open create flow with prefill.  
   - Make `QuickCreateEntityModal` customer path require `customer_type` (reuse drawer validation) or route nested create to the canonical centered `CustomerProfileForm` modal.  
   - Prefer **one** customer create chrome and **one** vendor create chrome (canonical full modal); keep Quick Create as a thin wrapper that opens the same form, not a second schema.

2. **Wire total-connectivity on list transaction grids:**  
   Doc # → `EntityLink` invoice/bill; row click → detail. Populate trucking columns from load joins or hide until data exists (never show fake `—` columns as if loaded).

3. **Reconcile architectural design with shipped QBO shell (additive):**  
   Update `IH35_ARCHITECTURAL_DESIGN.md` Module 8/10 to document (a) list master-detail QBO tabs, (b) detail-page tab sets, (c) which arch tabs remain deferred with named future blocks — **or** add the missing module tabs (By Quality Flag, Pending FMCSA, Disputes, Fuel/Tow filters, Settings, KPIs) without deleting current surfaces. Do not delete QBO-ish tabs to “match” an outdated design count.

4. **Statements + aging honesty:** Ship customer statement generation (or deep-link to a real Statements report) before claiming QBO customer parity; surface full aging buckets on MD financial summary.

5. **Vendor ACH / payment methods:** Replace notes heuristic with structured payment-method records (or explicit “not on file”) before any Bill Pay automation.

6. **Live defect layer still required:** Authed pass on `app.ih35dispatch.com` for create→detail→invoice/bill→payment round-trips and QBO sync exception counts — this audit is repo-complete, not live-complete.

---

## Evidence index (primary files)

| Area | Path |
|------|------|
| List pages | `apps/frontend/src/pages/Customers.tsx`, `Vendors.tsx` |
| Detail pages | `apps/frontend/src/pages/CustomerDetail.tsx`, `VendorDetail.tsx` |
| Create chrome | `CustomerProfileForm.tsx`, `VendorCreateModal.tsx`, `QuickCreateEntityModal.tsx`, `NewCustomerDrawerForm.tsx` |
| List views | `customers/CustomersListView.tsx`, `vendors/VendorsListView.tsx` |
| Sync | `CustomersSyncPanel.tsx`, `VendorsSyncPanel.tsx` |
| EntityLink | `apps/frontend/src/components/shared/EntityLink.tsx` |
| Routes | `apps/frontend/src/routes/manifest.tsx` |
| Arch law | `docs/specs/IH35_ARCHITECTURAL_DESIGN.md` Module 8 & 10 |
| API gate | `apps/backend/src/mdata/customers.routes.ts` create refine |
