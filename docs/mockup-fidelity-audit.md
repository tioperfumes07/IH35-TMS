# Mockup Fidelity Audit

Scope: code-level audit only (routes/components/spec assets). No pixel/visual diff was performed.

Status legend:
- `MATCH` = structure appears aligned from code evidence
- `PARTIAL` = some expected structure present, some missing/incomplete
- `DIVERGED` = clear structural divergence from reference intent
- `STUB` = route points to `ComingSoonPage`/placeholder flow
- `VISUAL?` = fidelity needs screenshot/pixel comparison

## 1) Approved Reference Asset Inventory

### A. Files currently present under `docs/approved-screens/`
- `docs/approved-screens/README.md`
- `docs/approved-screens/MANIFEST.txt`

### B. Approved-screen assets declared in `docs/approved-screens/MANIFEST.txt` (56 paths)
- `docs/approved-screens/1-HOME_PAGE.png`
- `docs/approved-screens/10-Reports.png`
- `docs/approved-screens/11-Form_425-Design.png`
- `docs/approved-screens/2-Maintenance.png`
- `docs/approved-screens/3-Accounting-Dropdown.png`
- `docs/approved-screens/4-Banking_Homepage.png`
- `docs/approved-screens/5-Fuel_Planner.png`
- `docs/approved-screens/6-Safety.png`
- `docs/approved-screens/7-Drivers.png`
- `docs/approved-screens/8-Dispatch-Home.png`
- `docs/approved-screens/9-Lists_and_catalogs.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.19.23-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.19.32-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.20.22-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.20.32-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.21.19-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.21.25-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.21.38-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.21.52-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.22.00-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.24.43-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.24.48-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.25.00-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.25.08-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.25.16-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.25.22-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.47.16-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.47.42-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.47.51-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.47.54-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.48.12-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.48.19-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.48.37-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.48.49-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.49.02-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.49.39-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.49.50-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.49.56-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.50.02-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.50.19-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.50.29-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.50.52-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.51.15-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.51.23-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.51.31-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.51.56-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.52.06-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.52.16-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.52.23-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.52.32-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.52.45-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.52.49-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.53.02-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.53.06-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.53.09-pm.png`
- `docs/approved-screens/screenshot-2026-05-16-at-7.53.45-pm.png`

Note: those PNGs are declared by manifest, but the physical files are not present in this working tree under `docs/approved-screens/` (only `README.md` + `MANIFEST.txt` exist).

### C. HTML mockup files under `docs/`
- `docs/ih35-tms-prototype.html`
- `docs/design-mockups/book-load-wizard-v4.html`
- `docs/design-mockups/pdf-documents-monochrome.html`

### D. Design/layout references under `docs/specs/`
- `docs/specs/IH35_ARCHITECTURAL_DESIGN.md`
- `docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md`
- `docs/specs/IH35_CURSOR_BUILD_SPEC_V3.md`
- `docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md`
- `docs/specs/PHASE_5_BANKING_QBO_ARCHITECTURE.md`
- `docs/specs/CURSOR-PERMANENT-RULES.md`
- `docs/specs/templates/TEXAS_CONTRACT_TEMPLATES_FOR_ATTORNEY_REVIEW.md`

## 2) Approved Reference -> Live Implementation Map

| Module / page | Approved reference | Live route | Live component file | Status | Evidence (code-based) |
|---|---|---|---|---|---|
| Home | `docs/approved-screens/1-HOME_PAGE.png` (manifest) | `/home` | `apps/frontend/src/pages/home/HomePage.tsx` | VISUAL? | Route exists in `App.tsx`; component has KPI grid, attention panel, fleet snapshot, quick-jump cards; visual parity requires pixel check. |
| Maintenance | `docs/approved-screens/2-Maintenance.png` (manifest) | `/maintenance` | `apps/frontend/src/pages/maintenance/MaintenanceHome.tsx` | PARTIAL | Route + multi-tab shell exists; code contains explicit incomplete markers: `Fleet table view is in active development`, `Service / location board is in active development`, and `pending follow-up` toast for WO detail integration. |
| Accounting | `docs/approved-screens/3-Accounting-Dropdown.png` (manifest) | `/accounting` | `apps/frontend/src/pages/accounting/AccountingHubPage.tsx` | PARTIAL | Route exists; hub present with rollup sections, but subtitle states `uses current Wave 1 list routes`; accounting routes include multiple `ComingSoonPage` endpoints (`/accounting/bill-payments`, `/accounting/vendor-balances`, `/accounting/journal-entries`). |
| Banking | `docs/approved-screens/4-Banking_Homepage.png` (manifest) | `/banking` | `apps/frontend/src/pages/banking/BankingHome.tsx` | PARTIAL | 5-tab shell exists with real content in Accounts/Transactions/Reconciliation/Driver Escrow/Reports; still code-level reuse/surfacing and not a confirmed pixel match. |
| Fuel Planner | `docs/approved-screens/5-Fuel_Planner.png` (manifest) | `/fuel` | `apps/frontend/src/pages/fuel/FuelPlannerHome.tsx` | PARTIAL | Route exists; page has 8-tab subnav and core sections, but adjacent `/fuel/planner`, `/fuel/settings`, `/fuel/inbox` routes are still `ComingSoonPage`. |
| Safety | `docs/approved-screens/6-Safety.png` (manifest) | `/safety` (nested tabs) | `apps/frontend/src/pages/safety/SafetyLayout.tsx` + tabs under `apps/frontend/src/pages/safety/tabs/` | PARTIAL | Route exists as multi-group tab shell; several tabs still placeholders or deferred expansion (for example placeholder copy in safety screens). |
| Drivers | `docs/approved-screens/7-Drivers.png` (manifest) | `/drivers` | `apps/frontend/src/pages/Drivers.tsx` | PARTIAL | Route exists and has tabbed UI, KPIs, and data panels; several KPI/data-panel values are hardcoded display values, so implementation is not fully data-backed parity. |
| Dispatch Home | `docs/approved-screens/8-Dispatch-Home.png` (manifest) | `/dispatch` | `apps/frontend/src/pages/Dispatch.tsx` | VISUAL? | Route exists; list/kanban board and book-load modal wiring present. Structure exists, but visual fidelity to approved screen requires pixel comparison. |
| Lists & Catalogs | `docs/approved-screens/9-Lists_and_catalogs.png` (manifest) | `/lists` | `apps/frontend/src/pages/lists/ListsHubPage.tsx` | VISUAL? | Route exists; domain ribbon, all-catalog map, recent activity, and sync health card are implemented. Visual parity cannot be confirmed from code alone. |
| Reports | `docs/approved-screens/10-Reports.png` (manifest) | `/reports` | `apps/frontend/src/pages/reports/ReportsHome.tsx` | VISUAL? | Route exists; reports nav, KPI cards, phase-6 report links, frequent-run and schedule panels exist. Pixel-level alignment unknown without visual compare. |
| Form 425C | `docs/approved-screens/11-Form_425-Design.png` (manifest) | `/425c` | `apps/frontend/src/pages/form425c/Form425CHome.tsx` | VISUAL? | Route exists; multi-tab workflow (Profiles, QB Import, Form 425C, Merge/Export, History) is implemented; visual fidelity cannot be proven from code only. |
| Book Load Wizard V4 | `docs/design-mockups/book-load-wizard-v4.html` | `/dispatch` (modal flow) | `apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx` | PARTIAL | V4 modal exists and is wired from Dispatch; reference is a standalone HTML mockup while live implementation is modal inside dispatch route. |
| PDF Documents Monochrome | `docs/design-mockups/pdf-documents-monochrome.html` | `/documents` | `apps/frontend/src/pages/Documents.tsx` | VISUAL? | Route exists; structural and style fidelity to monochrome HTML reference requires rendered visual comparison. |

## 3) Explicit Callouts

### A. Live routes with NO approved reference asset found

Examples with live routes but no direct approved mockup asset in `docs/approved-screens/` or `docs/design-mockups/*.html`:
- `/customers` -> `apps/frontend/src/pages/Customers.tsx`
- `/customers/:id` -> `apps/frontend/src/pages/CustomerDetail.tsx`
- `/vendors` -> `apps/frontend/src/pages/Vendors.tsx`
- `/vendors/:id` -> `apps/frontend/src/pages/VendorDetail.tsx`
- `/legal` -> `apps/frontend/src/pages/legal/LegalLandingPage.tsx`
- `/users` -> `apps/frontend/src/pages/Users.tsx`
- `/help` -> `apps/frontend/src/pages/help/HelpCenterPage.tsx`
- `/driver-app` -> `apps/frontend/src/pages/DriverAppLandingPage.tsx`

### B. Approved reference assets with NO corresponding live route/page

- `docs/ih35-tms-prototype.html` has no single canonical route binding in `App.tsx`; it is a broad prototype artifact rather than a directly routed page.
- Manifest-declared screenshot assets under `docs/approved-screens/screenshot-*.png` have no explicit one-to-one route mapping in code.

### C. Vendors and Customers (explicit)

| Page | Route(s) | Component | Status | Evidence |
|---|---|---|---|---|
| Customers | `/customers`, `/customers/:id` | `apps/frontend/src/pages/Customers.tsx`, `apps/frontend/src/pages/CustomerDetail.tsx` | VISUAL? | Routes are live in `App.tsx`; no direct approved reference asset path found for customer module, so fidelity cannot be judged as MATCH from code-only evidence. |
| Vendors | `/vendors`, `/vendors/:id` | `apps/frontend/src/pages/Vendors.tsx`, `apps/frontend/src/pages/VendorDetail.tsx` | VISUAL? | Routes are live in `App.tsx`; no direct approved reference asset path found for vendor module, so fidelity cannot be judged as MATCH from code-only evidence. |

## 4) Method Limits (honesty note)

This audit inspects route wiring, component structure, and code comments/copy. It does not compare rendered pixels/screenshots against approved PNG/HTML references; therefore any item needing visual confirmation is marked `VISUAL?`.
