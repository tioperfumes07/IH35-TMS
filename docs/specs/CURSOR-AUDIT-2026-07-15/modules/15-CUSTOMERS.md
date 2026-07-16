# 15 — CUSTOMERS

**Verdict:** QBO-shaped master-detail hub ships with real create + billing detail, but architectural design’s 8 tabs are largely replaced by QBO chrome with many “coming soon” stubs; “New transaction” deep-link to invoices drops `customer_id` (dead param).

## Live evidence notes
**REPO-ONLY** (no live browser this pass). Verified from:
- Sidebar: `apps/frontend/src/components/layout/sidebar-config.ts` L116 → `/customers`
- Routes: `apps/frontend/src/routes/manifest.tsx` L869–882 (`/customers`, `/customers/:id`); accounting aliases L3416–3419 → `/customers`
- Hub: `apps/frontend/src/pages/Customers.tsx`
- Detail: `apps/frontend/src/pages/CustomerDetail.tsx`
- Arch design MODULE 8: `docs/specs/IH35_ARCHITECTURAL_DESIGN.md` L470–503
- EntityLink: `apps/frontend/src/components/shared/EntityLink.tsx` L82–83 → `/customers/:id`

## Surface / button inventory

| Surface | Control | Route/behavior | Status |
|---------|---------|----------------|--------|
| Sidebar CUSTOMERS | Nav item | `/customers` | HAVE |
| Accounting flyout | (none for customers) | Accounting flyout only Hub/Invoices/Payments/Factoring | DRIFT (customers orphaned from accounting flyout) |
| `/customers` header | List view / Master-detail toggle | Pref `useViewModePref("customers")` | HAVE |
| `/customers` header | Active / Inactive / All | Soft-delete `deactivated_at` filter | HAVE |
| `/customers` header | Type filter (broker / direct_shipper) | Roster filter | HAVE |
| `/customers` header | Credit status filter | active/inactive/credit_hold/blacklist | HAVE |
| `/customers` header | **+ Create Customer** | Centered `Modal` + `CustomerProfileForm` → `createCustomer` → navigate `/customers/:id` | HAVE |
| `/customers` | `CustomersSyncPanel` | QBO sync health (read) | HAVE |
| List view | Row click | Switches to master-detail + selects | HAVE |
| List view | Name `Link` | `/customers/:id` | HAVE (Link, not EntityLink) |
| Master-detail sidebar | Search / sort / pager | Client-side over limit 5000 roster | HAVE |
| Selected header | **Edit** | `/customers/:id` | HAVE |
| Selected header | **New transaction** | `/accounting/invoices?customer_id=` | **WILL FAIL** — `InvoicesListPage` never reads `customer_id` from URL (`useState("")` L66; no `useSearchParams`) |
| Master-detail tabs (12) | Transaction List | Invoices via `listInvoices` + ParityTable | HAVE (data) / DRIFT (no invoice EntityLink in hub table) |
| Master-detail tabs | Customer Details | Wired fields + Edit | HAVE |
| Master-detail tabs | COI Requests | `CustomerCOITab` | HAVE |
| Master-detail tabs | Activity Feed, Statements, Recurring, Projects, Late Fees, Notes, Tasks, Opportunities, Conversations | `CustomerTabComingState` honest stubs | MISSING (explicit) |
| Create modal | Cancel / Save | Mutation + toast | HAVE |
| `/customers/:id` tabs (13) | Profile, Contacts, Billing & Receivables, Quality & History, Lanes & Pricing, Documents, COI, Contracts, Portal Users, Tasks, Loads, Per-Customer P&L, Audit History | `CustomerDetail.tsx` L85 | HAVE surface / mixed wire |
| Detail Profile | **Save** | Persist profile | HAVE |
| Detail Contacts | **+ Create Contact** / Deactivate | Contacts CRUD | HAVE |
| Detail Billing | **Record Payment** | Cash application UI on Billing tab | HAVE |
| Detail Billing | Invoice `EntityLink` | `/accounting/invoices/:id` | HAVE |
| Detail Loads | Load `EntityLink` / row → load | `/dispatch/loads/:id` | HAVE |
| Detail Quality | **+ Create Event** | Quality timeline | HAVE |
| Detail Lanes | **+ Create Lane** / Deactivate | Lane pricing | HAVE |
| Detail P&L | Link to full report | `/reports/customer-profitability` | HAVE |
| Arch design tabs | By Quality Flag, Pending FMCSA, Disputes, Factoring Config, Scoring, Settings | Design L480–491 | DRIFT — not implemented as hub sub-nav; partial elsewhere |
| Arch KPI row | 5 cards (Active/Open Loads/MTD Rev/AR/Disputes) | Design L493–494 | MISSING on hub (financial summary open/overdue only) |

## Connectivity to money/ops
- **Forward:** Create customer → detail; detail Billing → invoices + Record Payment; Loads → dispatch; Factoring company vendor via EntityLink on billing summary (`CustomerDetail.tsx` ~L1855).
- **Reverse:** Invoices list EntityLinks customers; EntityKind `customer` resolves.
- **Dead params:** `New transaction` → `?customer_id=` ignored on invoices list (**WILL FAIL**).
- **Hub Transaction List:** trucking columns Load#/Settlement#/Truck# render `"—"` hard-coded (`Customers.tsx` txColumns) — connectivity theater.
- **Law of Land gap:** Hub ParityTable does not EntityLink invoice rows.

## HAVE / MISSING / DRIFT / WILL FAIL
**HAVE:** Centered + Create Customer; roster soft-delete; master-detail + list modes; rich `/customers/:id` including Record Payment, Loads, P&L; EntityLink on detail invoices/loads; accounting redirect aliases.
**MISSING:** Arch 8-tab hub (Quality Flag / FMCSA queue / Disputes / Factoring Config / Scoring / Settings); hub KPI strip; 9 QBO-style coming-soon tabs; invoice EntityLink on hub transactions.
**DRIFT:** Hub tab set is QBO chrome (12 tabs) vs design 8; “New transaction” label ≠ locked create vocab; List view uses raw `Link` not EntityLink.
**WILL FAIL:** Training/ops “New transaction” from customer hub lands on unfiltered invoice list (customer_id dropped).

## Professional recommendation
Wire `InvoicesListPage` (and create-invoice entry) to honor `?customer_id=` and optionally open create with customer preselected — same pattern as `BillsPage` `vendor_id`. Keep centered Create Customer modal. Replace coming-soon QBO tabs with real endpoints or archive them behind honest “not built” and restore design tabs that matter for trucking (FMCSA queue, Factoring Config, Disputes) as additive tabs — never delete the QBO surfaces. EntityLink every invoice/load id on the hub Transaction List. Update `IH35_ARCHITECTURAL_DESIGN.md` MODULE 8 to match the shipped QBO+trucking hybrid after owner approval.

## Deep button inventory (repo) — finish pass 2026-07-15

**Evidence root:** `apps/frontend/src/pages/Customers.tsx` · `CustomerDetail.tsx` · `InvoicesListPage.tsx` · sidebar `sidebar-config.ts:116`

### Hub CTAs
| Control | File:line | Behavior | Status |
|---------|-----------|----------|--------|
| Sidebar CUSTOMERS | `sidebar-config.ts:116` | `/customers` | HAVE |
| **+ Create Customer** | `Customers.tsx:436` | Centered modal + form | HAVE |
| **New transaction** | `Customers.tsx:496-497` | `/accounting/invoices?customer_id=` | HAVE link |
| `customer_id` honor on invoices | `InvoicesListPage.tsx:57,67-68,97` | `useSearchParams` → filter | HAVE **in this worktree** (connectivity lane; confirm shipped to prod) |
| Hub tx Load#/Settlement#/Truck# | `Customers.tsx:354-359` | Hard-coded `"—"` | DRIFT / WILL FAIL connectivity theater |
| QBO coming-soon tabs | `Customers.tsx:133-150,585-587` | `CustomerTabComingState` | STUB / MISSING |
| Detail tabs (13) | `CustomerDetail.tsx:85` | Profile…Audit History | HAVE surface |
| Record Payment | `CustomerDetail.tsx:1878` | Billing tab | HAVE |
| Invoice EntityLink | `CustomerDetail.tsx:1968,2116` | `/accounting/invoices/:id` | HAVE |
| Load EntityLink | `CustomerDetail.tsx:275,1659` | Dispatch loads | HAVE |
| Factoring company vendor EntityLink | `CustomerDetail.tsx:1855` | Vendor link | HAVE |

### Top WILL FAIL (new evidence)
1. **Hub Transaction List trucking columns always “—”** — `Customers.tsx:354-359`.
2. **Nine QBO hub tabs stay “coming soon”** — `COMING_STATE_COPY` `:133+`.
3. **Prod may still drop `customer_id`** until connectivity lane ships — verify against live after merge.

**Never delete** Customers hub QBO chrome or detail tabs — wire or archive-reachable stubs; keep Create Customer modal.
