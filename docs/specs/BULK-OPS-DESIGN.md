# BULK Operations Design — Select / Multi-Edit Cluster

**Block:** BULK-RBC (read-only investigation → design doc)  
**Branch:** `rbc/bulk-ops-investigation`  
**Status:** RBC complete — feeds BULK-1..BULK-6 implementation GO files  
**Last updated:** 2026-06-04 · CURSOR-A Lane A

> **ARCHIVE-not-DELETE:** Bulk capability is **additive**. Existing list pages, routes, and single-row edit flows remain unchanged. Bulk UI wraps on top; no list page is replaced or removed.

---

## Executive Summary

IH35 TMS operators manage ~2,655 customers, ~2,744 vendors, ~25 drivers, ~32 trucks, hundreds of trailers/equipment rows, and growing invoice/bill volumes. Nearly every module renders entity tables with **one-row-at-a-time** edit paths. Only the Maintenance **Fleet Table** (`/maintenance/fleet-table`) ships bulk-select today (Block A5: `BulkActionBar` + `POST /api/v1/mdata/units/bulk-update` and `POST /api/v1/mdata/equipment/bulk-update`).

This document inventories **42 operational and catalog list pages**, defines bulk actions per entity type, and locks backend/frontend contracts so BULK-1..BULK-6 can implement without rework.

**Investigation sources (read-only, 2026-06-04):**

| Probe | Finding |
|-------|---------|
| List pages | 71 `*ListPage.tsx` files; 42 entity-table pages in inventory below (excludes hub/test/deprecated) |
| PATCH/update endpoints | 80+ `app.patch` / `app.put` routes under `apps/backend/src/**/*.routes.ts` |
| Audit emit | `appendCrudAudit()` → `SELECT audit.append_event(...)` in `apps/backend/src/audit/crud-audit.ts`; bulk precedent: one `unit.bulk_update` / `equipment.bulk_update` row **per affected ID** |
| Permission gate | `requireAuth()` session check + inline `isWriteRole()` (Owner/Administrator/Manager) on write routes; no global `requirePermission()` middleware yet |
| Shared components | `apps/frontend/src/components/shared/`: ActionButton, BackButton, Breadcrumb, Combobox, HoverDropdown, ListErrorBanner, SecondaryNavTabs, SelectCombobox |

---

## Section A — List Pages Inventory

Pages that render a **table of real data entities** (not static hubs). Production row counts are Jorge-stated estimates unless noted.

| # | Module | Route | Page component | Entity type | ~Prod rows | Filters / search / pagination | Bulk today |
|---|--------|-------|----------------|-------------|------------|-------------------------------|------------|
| 1 | CUSTOMERS | `/customers` | `pages/Customers.tsx` | customer | 2,655 | Search, company scope, tab filters | No |
| 2 | VENDORS | `/vendors` | `pages/Vendors.tsx` | vendor | 2,744 | Search, company scope, tabs | No |
| 3 | DRIVERS | `/drivers` | `pages/drivers/DriversListPage.tsx` | driver | 25 | Search, status tabs, pagination | No |
| 4 | USERS | `/users` | `pages/Users.tsx` | user | 40 | Search, role filter | No |
| 5 | DISPATCH | `/dispatch` (list view) | `pages/dispatch/DispatchBoard.tsx` | load | 500+ active | Status/customer/driver/date/search, 50-row pages | No |
| 6 | DISPATCH | `/dispatch/loads` | `pages/dispatch/components/LoadTable.tsx` | load | 500+ | Same filter set as board | No |
| 7 | DISPATCH | `/dispatch/at-risk` | `pages/dispatch/AtRiskQueuePage.tsx` | load | 20–80 | Queue filters | No |
| 8 | DISPATCH | `/dispatch/detention` | `pages/dispatch/DetentionBoardPage.tsx` | load (detention) | 10–50 | Board filters | No |
| 9 | DISPATCH | `/dispatch/ocr-queue` | `pages/dispatch/OcrQueuePage.tsx` | load document | 5–30 | Status filter | No |
| 10 | DISPATCH | `/dispatch/pod-review` | `pages/dispatch/PodReviewPage.tsx` | load POD | 10–40 | Date/status | No |
| 11 | ACCTG | `/accounting/invoices` | `pages/accounting/InvoicesListPage.tsx` | invoice | 1,200+ | Status, customer, date range, pagination | No |
| 12 | ACCTG | `/accounting/bills` | `pages/accounting/BillsPage.tsx` | bill | 900+ | Vendor, status, date | No |
| 13 | ACCTG | `/accounting/payments` | `pages/accounting/PaymentsListPage.tsx` | payment | 400+ | Customer, method, date | No |
| 14 | ACCTG | `/accounting/bill-payments` | `pages/accounting/BillPaymentsListPage.tsx` | bill payment | 300+ | Vendor, date | No |
| 15 | ACCTG | `/accounting/factoring` | `pages/accounting/FactoringListPage.tsx` | factoring batch | 50+ | Status, factor | No |
| 16 | ACCTG | `/accounting/journal-entries` | `pages/accounting/ManualJEListPage.tsx` | journal entry | 200+ | Period, status | No |
| 17 | ACCTG | `/accounting/pre-settlements` | `pages/accounting/AccountingPreSettlementsPage.tsx` | settlement | 100+ | Driver, period | No |
| 18 | ACCTG | `/accounting/collections` | `pages/accounting/CollectionsPage.tsx` | AR collection | 80+ | Aging bucket | No |
| 19 | ACCTG | `/accounting/vendor-balances` | `pages/accounting/VendorBalancesPage.tsx` | vendor balance | 2,744 | Search, sort | No |
| 20 | BANK | `/banking` (transactions tab) | `pages/banking/components/BankingTransactionsDesignView.tsx` | bank transaction | 5,000+ | Account, categorize state, date | Partial (inline bulk categorize checkbox) |
| 21 | BANK | `/banking/transfers` | `pages/banking/TransfersListPage.tsx` | transfer | 200+ | Account, date | No |
| 22 | BANK | `/banking/categorization-rules` | `pages/banking/CategorizationRulesPage.tsx` | categorization rule | 30+ | Search | No |
| 23 | MAINT | `/maintenance/fleet-table` | `components/FleetTable.tsx` | vehicle + trailer | 32 trucks + ~120 trailers | Status, type URL sync | **Yes (A5)** |
| 24 | MAINT | `/maintenance/active-wos` | `pages/work-orders/WorkOrdersConsoleListPage.tsx` | work order | 150+ | Status, vendor, unit | No |
| 25 | MAINT | `/maintenance/vehicles` | `pages/maintenance/VehiclesListPage.tsx` | maintenance vehicle | 32 | Search, status | No |
| 26 | MAINT | `/maintenance/vendors` | `pages/lists/maintenance/MaintenanceVendorsListPage.tsx` | maint vendor | 80+ | Search | No |
| 27 | MAINT | `/maintenance/parts-inventory` | `pages/lists/maintenance/MaintenancePartsListPage.tsx` | part SKU | 200+ | Search, low-stock | No |
| 28 | SAFETY | `/safety/medical-cards` | `pages/safety/MedicalCardsPage.tsx` | medical card | 25 | Expiry filter | No |
| 29 | SAFETY | `/safety/permits` | `pages/safety/PermitsPage.tsx` | permit | 40+ | Type, expiry | No |
| 30 | DOCS | `/documents` | `pages/Documents.tsx` | document | 2,000+ | Entity link, type, date | No |
| 31 | LEGAL | `/legal/matters` | `pages/legal/matters/LegalMattersListPage.tsx` | legal matter | 15+ | Status | No |
| 32 | LEGAL | `/legal/templates` | `pages/legal/templates/LegalTemplatesListPage.tsx` | legal template | 10+ | Category | No |
| 33 | ASSETS | `/assets` | `pages/assets/AssetsWorkspacePage.tsx` | asset | 50+ | Type, status | No |
| 34 | FACT | `/factoring/reserve` | `pages/factoring/ReserveDashboard.tsx` | reserve line | 30+ | Factor | No |
| 35 | LISTS | `/lists/accounting/chart-of-accounts` | `pages/lists/accounting/ChartOfAccountsListPage.tsx` | COA account | 120+ | Search | No |
| 36 | LISTS | `/lists/accounting/items` | `pages/lists/accounting/ItemsListPage.tsx` | item | 60+ | Search | No |
| 37 | LISTS | `/lists/dispatch/load-types` | `pages/lists/dispatch/LoadTypesListPage.tsx` | load type catalog | 15 | Search | No |
| 38 | LISTS | `/lists/fleet/equipment-types` | `pages/lists/fleet/EquipmentTypesListPage.tsx` | equipment type | 12 | Search | No |
| 39 | LISTS | `/lists/driver/pay-rate-templates` | `pages/lists/driver/PayRateTemplatesListPage.tsx` | pay template | 8 | Search | No |
| 40 | LISTS | `/lists/fuel/fuel-brands` | `pages/lists/fuel/FuelBrandsListPage.tsx` | fuel brand catalog | 20 | Search | No |
| 41 | LISTS | `/lists/maintenance/failure-codes` | `pages/lists/maintenance/MaintenanceFailureCodesListPage.tsx` | failure code | 40+ | Search | No |
| 42 | LISTS | `/lists/safety/company-violation-types` | `pages/lists/safety/CompanyViolationTypesListPage.tsx` | violation type | 25 | Search | No |

**Inventory count:** 42 list pages (30+ operational + 12 representative catalog pages; 54 additional catalog `*ListPage.tsx` files follow the same pattern and inherit BULK-6 catalog tier).

**Tiering for rollout:**

| Tier | Pages | BULK block |
|------|-------|------------|
| P0 — high volume | #1–3, #11–13, #5–6, #23 | BULK-3, BULK-4, BULK-5 |
| P1 — medium | #4, #7–10, #14–19, #24–30 | BULK-5, BULK-6 |
| P2 — catalog | #35–42 (+ remaining lists/*) | BULK-6 (archive/status only) |

---

## Section B — Actions Per Entity Type

Bulk actions that benefit operators. **Confirm** = typed phrase or dual-step modal. **Reason** = free-text ≥10 chars required on status/archive mutations.

### Customer (`mdata.customers`)

| Action | Payload fields | Confirm? | Reason? | Notes |
|--------|----------------|----------|---------|-------|
| `set_status` | `status: active \| inactive` | Yes | Yes | Mirrors `PATCH /api/v1/mdata/customers/:id` |
| `archive` | — | Yes (typed `ARCHIVE`) | Yes | Sets `archived_at`; never hard-delete |
| `set_classification` | `classification: preferred \| standard \| caution \| avoid` | No | No | From customer quality rating |
| `set_default_tax_form` | `tax_form: W9 \| W8 \| exempt` | No | No | Accounting sync side-effect |
| `bulk_email` | `template_id`, `subject` | Yes | Yes | Outbox queue; not synchronous send |

### Vendor (`mdata.vendors`)

| Action | Payload fields | Confirm? | Reason? | Notes |
|--------|----------------|----------|---------|-------|
| `set_status` | `status: active \| inactive` | Yes | Yes | |
| `archive` | — | Yes (typed `ARCHIVE`) | Yes | |
| `set_1099_eligible` | `eligible: boolean` | No | No | Tax reporting |
| `set_default_expense_account` | `account_id: uuid` | No | No | QBO mirror update |
| `bulk_email` | `template_id` | Yes | Yes | |

### Driver (`mdata.drivers`)

| Action | Payload fields | Confirm? | Reason? | Notes |
|--------|----------------|----------|---------|-------|
| `set_status` | `status: active \| inactive \| terminated` | Yes | Yes | Per-row OOS reason if `inactive` |
| `archive` | — | Yes | Yes | |
| `set_oos_reason` | `reason_code_id` | No | Yes | Safety linkage |
| `assign_unit` | `unit_id: uuid \| null` | Yes | No | Conflicts if unit already assigned |
| `bulk_message` | `message_body` | Yes | No | PWA push via outbox |
| `set_cdl_endorsement` | `endorsement_codes: string[]` | No | No | |
| `set_team` | `team_id: uuid` | No | No | |

### Vehicle / Unit (`mdata.units`)

| Action | Payload fields | Confirm? | Reason? | Notes |
|--------|----------------|----------|---------|-------|
| `set_status` | `status: Active \| Sold \| Transferred \| Damaged \| OOS` | No | Yes if OOS | **Shipped A5** |
| `set_vehicle_type` | `vehicle_type: string` | No | No | **Shipped A5** |
| `assign_driver` | `driver_id: uuid \| null` | Yes | No | Dispatch conflict check |
| `set_location` | `location_id: uuid` | No | No | |
| `set_pm_profile` | `pm_profile_id: uuid` | No | No | Maintenance schedules |

### Trailer (`mdata.equipment`)

| Action | Payload fields | Confirm? | Reason? | Notes |
|--------|----------------|----------|---------|-------|
| `set_status` | 5 UI statuses (maps to DB enum) | No | Yes if OOS | **Shipped A5** |
| `set_type` | `equipment_type: Reefer \| DryVan \| Flatbed \| ...` | No | No | **Shipped A5** |
| `assign_unit` | `current_unit_id: uuid \| null` | Yes | No | |
| `archive` | — | Yes | Yes | |

### Load (`dispatch.loads`)

| Action | Payload fields | Confirm? | Reason? | Notes |
|--------|----------------|----------|---------|-------|
| `set_status` | `transition: booked \| assigned \| ...` | Yes | Yes | Validated state machine |
| `mark_factored` | `factor_id: uuid` | Yes | No | Accounting hook |
| `mark_paid` | — | Yes | Yes | Owner/Admin only |
| `export_csv` | column selection | No | No | Client-side; no backend bulk |
| `prompt_pod_upload` | — | No | No | Opens batch upload modal |

### Invoice (`accounting.invoices`)

| Action | Payload fields | Confirm? | Reason? | Notes |
|--------|----------------|----------|---------|-------|
| `set_status` | `status: draft \| sent \| paid \| void` | Yes | Yes if void | |
| `mark_sent` | `sent_at: timestamp` | No | No | |
| `mark_factored` | `batch_id: uuid` | Yes | No | |
| `bulk_pdf_download` | — | No | No | ZIP stream; read-only |

### Bill (`accounting.bills`)

| Action | Payload fields | Confirm? | Reason? | Notes |
|--------|----------------|----------|---------|-------|
| `set_status` | `status: open \| scheduled \| paid \| void` | Yes | Yes if void | |
| `mark_paid` | `paid_at`, `payment_method` | Yes | Yes | |
| `mark_scheduled` | `scheduled_date` | No | No | |
| `set_classification` | `expense_category_id` | No | No | |

### Payment (`accounting.payments`)

| Action | Payload fields | Confirm? | Reason? | Notes |
|--------|----------------|----------|---------|-------|
| `export_csv` | date range | No | No | |
| `mark_reconciled` | `reconciled_at` | No | No | Banking linkage |

### Settlement (`accounting.settlements`)

| Action | Payload fields | Confirm? | Reason? | Notes |
|--------|----------------|----------|---------|-------|
| `bulk_pay` | `payment_method` | Yes (typed `AUTO PAY`) | Yes | WF high-risk |
| `bulk_hold` | `hold_reason` | Yes | Yes | |
| `bulk_approve` | — | Yes | No | Manager+ |

### Equipment / Asset transfer (`assets.assets`, `mdata.equipment`)

| Action | Payload fields | Confirm? | Reason? | Notes |
|--------|----------------|----------|---------|-------|
| `bulk_transfer` | `to_company_id`, `effective_date` | **Dual confirm (WF-047)** | Yes | Two-step modal |
| `archive` | — | Yes | Yes | |
| `set_location` | `location_id` | No | No | |
| `set_status` | entity-specific enum | Yes | Yes if OOS | |

### Document (`documents.documents`)

| Action | Payload fields | Confirm? | Reason? | Notes |
|--------|----------------|----------|---------|-------|
| `archive` | — | Yes | Yes | |
| `reclassify` | `document_type_id` | No | No | |
| `bulk_download` | — | No | No | ZIP; read-only |

### Catalog rows (`reference.*` / lists modules)

| Action | Payload fields | Confirm? | Reason? | Notes |
|--------|----------------|----------|---------|-------|
| `archive` | — | Yes | No | ARCHIVE-not-DELETE standard |
| `set_active` | `is_active: boolean` | No | No | |
| `reorder` | `sort_order: number` | No | No | Out of BULK-1 scope |

---

## Section C — Backend Endpoint Contract

### Canonical shape (new framework in BULK-2)

```
POST /api/v1/{domain}/{resource}/bulk-update?operating_company_id={uuid}
```

**Request body:**

```json
{
  "ids": ["uuid", "..."],
  "action": "set_status",
  "payload": { "status": "inactive" },
  "reason": "Annual vendor cleanup — inactive since 2024"
}
```

| Field | Type | Rules |
|-------|------|-------|
| `ids` | `string[]` | 1–200 UUIDs per call (proposed; A5 uses 100 for fleet) |
| `action` | enum | Per-entity action registry (Section B) |
| `payload` | object | Action-specific; validated by Zod per resource |
| `reason` | string | Required when `action` mutates status or archives; min 10 chars |

**Response body:**

```json
{
  "requested": 47,
  "succeeded": ["uuid-1", "uuid-2"],
  "failed": [{ "id": "uuid-3", "code": "E_STATE_INVALID", "message": "Load already delivered" }],
  "audit_log_ids": ["evt-uuid-1", "evt-uuid-2"],
  "bulk_call_id": "bulk-uuid"
}
```

### Transaction model

**Decision: per-ID transactions with partial success** (not one wrapping transaction).

- Each ID processed in its own `SAVEPOINT`; failure rolls back only that ID.
- Response always returns 200 with `succeeded` + `failed` arrays when auth passes (422 only when entire request is invalid: empty ids, unknown action, missing reason).
- Idempotency: repeating the same `ids` + `action` + `payload` on unchanged rows returns those IDs in `succeeded` with no duplicate audit rows (compare `buildPatchChanges` no-op skip).

**Precedent:** `apps/backend/src/mdata/unit-bulk-update.routes.ts` loops units, skips no-ops, emits per-unit audit.

### Permission gate

Same role that can single-row edit:

- `requireAuth()` → session user
- Write roles: Owner, Administrator, Manager (matches existing `isWriteRole()`)
- Destructive actions (void, archive, bulk_pay): Owner + Administrator only
- No separate backend `bulk_ops` permission (UI-only visibility flag — Section E)

### Audit emission

- **One `audit.audit_events` row per affected ID**, not one row per HTTP call.
- Event class: `{entity}.{action}` e.g. `customer.bulk_set_status`, `vendor.bulk_archive`.
- Payload includes: `bulk_call_id`, `action`, `changes` (from/to), `reason`, `action_source: "bulk"`.
- Implementation: extend `appendCrudAudit()` caller pattern; `sourceTag: "BULK-OPS"`.

### Rate limit

| Limit | Value | Enforcement |
|-------|-------|-------------|
| Max IDs per request | 200 | Zod + 400 response |
| Min interval between bulk calls | 5 seconds per user | Redis sliding window in BULK-2 |
| Max concurrent bulk jobs | 1 per user | 429 if second call in flight |

**Existing endpoints to fold into framework:**

- `POST /api/v1/mdata/units/bulk-update` (100 IDs, patch `{status, vehicle_type}`)
- `POST /api/v1/mdata/equipment/bulk-update` (100 IDs, patch `{status, equipment_type}`)

**Representative single-row endpoints for BULK wire-up:**

| Entity | Single-row route |
|--------|------------------|
| Customer | `PATCH /api/v1/mdata/customers/:id` |
| Vendor | `PATCH /api/v1/mdata/vendors/:id` |
| Driver | `PATCH /api/v1/mdata/drivers/:id` |
| Load | `PATCH /api/v1/dispatch/loads/:id/transition` |
| Invoice/Bill | accounting module PATCH routes |
| Work order | `PATCH /api/v1/maintenance/work-orders/:id` |

---

## Section D — Frontend Component Contract

Bulk UI is **additive** — wraps existing tables; no replacement of list page components.

### 1. `TableSelection` (BULK-1)

Wraps any list table body.

```tsx
type TableSelectionProps = {
  rowId: (row: unknown) => string;
  selectedIds: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  pageRowIds: string[];
  children: (ctx: { isSelected: (id: string) => boolean; toggle: (id: string) => void }) => React.ReactNode;
};
```

| Decision | Choice |
|----------|--------|
| Checkbox column position | **Leftmost** (matches Fleet Table A5) |
| Select-all scope | Current page only; banner shows total selected across pages |
| Persistence on filter/sort/page change | **Selected IDs kept in Set** — do not auto-clear |
| Display cap | Show `"47 selected"`; truncate list tooltip at 20 IDs |
| Shift+click range select | **Out of scope BULK-1** → BULK-extra later |

### 2. `BulkActionBar` (BULK-1)

Generalize existing `apps/frontend/src/components/fleet/BulkActionBar.tsx`.

```tsx
type BulkActionBarProps = {
  selectedCount: number;
  actions: Array<{ id: string; label: string; destructive?: boolean; onClick: () => void }>;
  onClear: () => void;
  applying?: boolean;
};
```

| Decision | Choice |
|----------|--------|
| Position | Sticky top of table work area (A5 pattern) |
| Visibility | Render when `selectedCount > 0` |
| Mobile | Collapse actions into overflow menu |

### 3. `BulkActionModal` (BULK-1)

```tsx
type BulkActionModalProps = {
  open: boolean;
  actionLabel: string;
  affectedCount: number;
  requiresReason: boolean;
  requiresTypedConfirm?: string; // e.g. "ARCHIVE", "AUTO PAY"
  payloadFields?: React.ReactNode;
  onConfirm: (input: { reason?: string; payload?: Record<string, unknown> }) => void;
  onCancel: () => void;
};
```

Uses existing `apps/frontend/src/components/Modal.tsx` (post-A15 nested-box pattern).

### 4. `BulkProgressDialog` (BULK-1)

```tsx
type BulkProgressDialogProps = {
  open: boolean;
  requested: number;
  succeeded: number;
  failed: Array<{ id: string; message: string }>;
  onClose: () => void;
  onRetryFailed?: () => void;
};
```

Shows progress bar during fetch; post-response drill-down for failures with row deep-links.

### Hook: `useBulkSelection`

```tsx
function useBulkSelection() {
  return {
    selectedIds: Set<string>,
    toggle: (id: string) => void,
    selectPage: (ids: string[]) => void,
    clear: () => void,
    count: number,
  };
}
```

### API client helper (BULK-2)

```tsx
bulkUpdate(domain: string, resource: string, body: BulkUpdateRequest): Promise<BulkUpdateResponse>
```

---

## Section E — Permission + Audit Model

### Permission gate (BULK-2 + BULK-6)

| Layer | Rule |
|-------|------|
| Backend | Single-row edit permission suffices. Route checks `requireAuth()` + role matrix identical to PATCH counterpart. |
| Frontend | Optional `bulk_ops` UI flag on role profile hides checkbox column when false — **does not block API** (defense: backend always authoritative). |
| Destructive | `archive`, `void`, `bulk_pay`, `bulk_transfer` require Owner or Administrator at backend. |

No new middleware file in BULK-RBC; BULK-2 adds `assertBulkActionAllowed(user, entity, action)` helper colocated with route registration.

### Audit model

Every successful per-ID mutation:

```sql
-- via appendCrudAudit → audit.append_event
event_class: '{entity}.bulk_{action}'
severity: 'info' | 'warning' (warning for archive/void/pay)
payload: {
  "entity_type": "customer",
  "entity_id": "uuid",
  "bulk_call_id": "uuid",
  "action_source": "bulk",
  "action": "set_status",
  "reason": "...",
  "changes": { "status": { "from": "active", "to": "inactive" } }
}
```

`bulk_call_id` is generated once per HTTP request (UUID v4) and shared across all audit rows from that call — enables Activity Log filtering.

### Rate limit enforcement

- **Where:** `apps/backend/src/lib/bulk-rate-limit.ts` (BULK-2), called at top of each bulk route.
- **Store:** Redis key `bulk:{user_id}:last_call` TTL 5s; `bulk:{user_id}:inflight` SETNX.
- **Response on limit:** 429 `{ "error": "bulk_rate_limited", "retry_after_seconds": N }`.

---

## Section F — Follow-Up Block Shapes (BULK-1..BULK-6)

### BULK-1 — Shared TableSelection + BulkActionBar (~8–12h)

| Item | Detail |
|------|--------|
| **Owns** | `apps/frontend/src/components/bulk/TableSelection.tsx`, `BulkActionBar.tsx`, `BulkActionModal.tsx`, `BulkProgressDialog.tsx`, `useBulkSelection.ts`, `apps/frontend/src/components/bulk/__tests__/*` |
| **Depends on** | BULK-RBC (this doc) |
| **Migration** | None |
| **Acceptance** | Storybook or test-page demonstrates wrap of mock 50-row table; select-all page; cross-page selection persists; modal reason validation; Fleet Table refactored to use shared components (behavior parity with A5) |

### BULK-2 — Backend bulk-update framework + audit + rate-limit (~6–10h)

| Item | Detail |
|------|--------|
| **Owns** | `apps/backend/src/bulk/bulk-update.factory.ts`, `bulk-rate-limit.ts`, `bulk.types.ts`, refactor `unit-bulk-update.routes.ts` + `equipment-bulk-update.routes.ts` to factory; `scripts/verify:bulk-audit-per-id.mjs` |
| **Depends on** | BULK-1 (shared types in OpenAPI comment only OK) |
| **Migration** | None |
| **Acceptance** | Factory registers route + Zod action map; per-ID partial success; one audit row per ID with `bulk_call_id`; rate limit 429; existing fleet bulk tests pass |

### BULK-3 — Vendors + Customers wire-up (~6–8h)

| Item | Detail |
|------|--------|
| **Owns** | `apps/backend/src/mdata/customers-bulk.routes.ts`, `vendors-bulk.routes.ts`, wire `Customers.tsx` + `Vendors.tsx`, tests |
| **Depends on** | BULK-1, BULK-2 |
| **Migration** | None |
| **Acceptance** | Bulk set_status + archive on customers/vendors; reason modal; activity log shows per-entity audit; 200-ID cap enforced |

### BULK-4 — Drivers + Vehicles + Trailers wire-up (~8–10h)

| Item | Detail |
|------|--------|
| **Owns** | `drivers-bulk.routes.ts`, migrate Fleet Table to shared bulk components, `DriversListPage.tsx`, trailer actions on fleet-table |
| **Depends on** | BULK-1, BULK-2 |
| **Migration** | None |
| **Acceptance** | Driver status/archive/assign; vehicle+trailer parity with A5 via shared framework; OOS reason per-row dialog for failures |

### BULK-5 — Loads + Invoices + Bills wire-up (~6–8h)

| Item | Detail |
|------|--------|
| **Owns** | `dispatch/loads-bulk.routes.ts`, accounting invoice/bill bulk routes, Dispatch list view + InvoicesListPage + BillsPage wiring |
| **Depends on** | BULK-1, BULK-2 |
| **Migration** | None |
| **Acceptance** | Load status transition bulk with state-machine validation; invoice mark_sent; bill mark_scheduled; partial failure surfaced in BulkProgressDialog |

### BULK-6 — Audit hooks + permission gating + tests + CI guard (~6–8h)

| Item | Detail |
|------|--------|
| **Owns** | Activity log bulk filter UI, `bulk_ops` role flag in identity, catalog list archive bulk, `verify:bulk-coverage.mjs`, `docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md` entry |
| **Depends on** | BULK-1..BULK-5 |
| **Migration** | None |
| **Acceptance** | CI guard fails if new `*ListPage.tsx` lacks bulk wrapper import (opt-out via `// BULK-EXEMPT`); Activity Log filter by `bulk_call_id`; catalog tier archive bulk on 3 sample list pages |

---

## Appendix — Investigation Command Output Summary

```bash
# 1. List pages (sample)
rg -l "ListPage" apps/frontend/src/pages --glob "*.tsx" | wc -l   # → 71 files

# 2. PATCH endpoints (sample)
rg -n 'app\.(patch|put)\(' apps/backend/src --glob "*.routes.ts" | wc -l   # → 80+

# 3. Audit pattern
# appendCrudAudit() in apps/backend/src/audit/crud-audit.ts
# SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)

# 4. Permission pattern
# requireAuth() in apps/backend/src/auth/session-middleware.ts
# Inline isWriteRole() on write routes — no requirePermission() middleware

# 5. Shared components
ls apps/frontend/src/components/shared/
# ActionButton BackButton Breadcrumb Combobox HoverDropdown
# ListErrorBanner SecondaryNavTabs SelectCombobox
```

---

**End of BULK-OPS-DESIGN.md**
