# Catalog Inventory & STUB Build Order — 2026-06-20 (live `20e0415`)

**Block:** Lane A · A1 (CATALOG-AUDIT-LIVE) · Tier 3 read-only audit · ships a truth doc, no app-behavior change.
**Purpose:** authoritative inventory of catalog surfaces + a prioritized build order for the STUBs — the
A2.. build queue. Built from live truth + repo, not the stale 2026-06-01 memory count (65/15/16/34).

> **Integrity note.** The 3-way classification WORK-WITH-DATA / WORK-EMPTY / STUB depends on **live
> OC-scoped row counts** (work-empty and work-with-data are the *same code*, different data). Direct prod
> access is gated for the coder (CLAUDE.md §1.5/§1.6 — no session, no embedded token), so **no count here
> is guessed.** §3 holds the **live classification measured by GUARD** (2026-06-20); rows GUARD has not yet
> sampled are marked live-pending until the read-only auditor is run. Everything else (names, routes,
> endpoints, OC-scoping, dedicated-page-vs-hub) is repo-truth at `20e0415`, authoritative as-is.

## 1. Surface shape (repo truth)
Catalogs surface two ways:
- **Dedicated `/catalogs/<name>` pages** (8) — each a first-class catalog page wired to its own endpoint.
- **`/lists/<dept>` department hubs** (9: accounting, dispatch, driver, drivers, fleet, fuel, maintenance,
  names, safety) — landing pages that group many sub-catalogs; the bulk of the long tail lives here.
- The app's own **`GET /api/v1/catalogs/registry`** returns the registered catalogs grouped by department
  **with a live `item_count` each** (via `fetchCatalogStats`) — the single best live source for the
  registered set. The registry table is seeded in `db/migrations/0020_catalog_metadata.sql` (8 curated
  entries) and extended at runtime; the long-tail stubs are **not** all in the registry.

## 2. Enumerated catalog endpoints (repo truth @ `20e0415`)
35 catalog list endpoints under `/api/v1/catalogs/*` (GET). `OC` = requires `?operating_company_id`.
The **Class** column resolves in **§3** (live, GUARD-measured); rows not yet in GUARD's sample are
live-pending until the full auditor is run. Unauthed, every endpoint is AUTH-REQUIRED except `fuel` (404 —
hub label, not a list endpoint).

| Dept | Catalog | Endpoint (`/api/v1/catalogs/…`) | OC | Dedicated page | Class (live → §3) |
|---|---|---|---|---|---|
| accounting | Chart of Accounts | `accounts` | Y | `/catalogs/accounts` | → §3 |
| accounting | Classes | `classes` | Y | `/catalogs/classes` | → §3 |
| accounting | Items | `items` | Y | `/catalogs/items` | → §3 |
| accounting | Payment Terms | `payment-terms` | Y | `/catalogs/payment-terms` | → §3 |
| accounting | Posting Templates | `posting-templates` | Y | `/catalogs/posting-templates` | → §3 |
| accounting | Account Role Bindings | `account-role-bindings` | Y | `/catalogs/account-role-bindings` | → §3 |
| accounting | Journal Entry Types | `accounting/journal-entry-types` | Y | hub | → §3 |
| accounting | QBO Categories | `accounting/qbo-categories` | Y | hub | → §3 |
| dispatch | Equipment Types | `equipment-types` | Y | `/catalogs/equipment-types` | → §3 |
| dispatch | Driver Load Statuses | `driver-load-statuses` | Y | `/catalogs/driver-load-statuses` | → §3 |
| dispatch | Cancellation Reasons | `cancellation-reasons` | – | hub | → §3 |
| dispatch | Load Cancellation Reasons | `load-cancellation-reasons` | Y | hub | → §3 |
| dispatch | Dispatch Flag Colors | `dispatch-flag-colors` | Y | hub | → §3 |
| dispatch | Dispatcher Error Reasons | `dispatcher-error-reasons` | Y | hub | → §3 |
| dispatch | Customer Quality Event Reasons | `customer-quality-event-reasons` | Y | hub | → §3 |
| driver | Driver Leave Balances | `driver-leave-balances` | Y | hub | → §3 |
| driver | Leave Policies | `leave-policies` | Y | hub | → §3 |
| driver | Driver Termination Reasons | `driver-termination-reasons` | Y | hub | → §3 |
| fleet | Fleet Equipment Types | `fleet/equipment-types` | Y | hub | → §3 |
| fleet | Tire Positions | `fleet/tire-positions` | Y | hub | → §3 |
| maintenance | Parts | `parts` | Y | hub | → §3 |
| maintenance | Parts Master | `maintenance/parts-master` | Y | hub | → §3 |
| maintenance | Services Catalog | `maintenance/services-catalog` | Y | hub | → §3 |
| maintenance | Labor Rates | `labor-rates` | Y | hub | → §3 |
| maintenance | Maintenance Part Locations | `maintenance-part-locations` | Y | hub | → §3 |
| safety | Complaint Types | `complaint-types` | Y | hub | → §3 |
| safety | Civil Fine Types | `safety/civil-fine-types` | Y | hub | → §3 |
| safety | Company Violation Types | `safety/company-violation-types` | Y | hub | → §3 |
| safety | Internal Fine Reasons | `safety/internal-fine-reasons` | Y | hub | → §3 |
| operations | Audit Event Types | `audit-event-types` | – | hub | → §3 |
| operations | File Categories | `file-categories` | Y | hub | → §3 |
| operations | US States | `us-states` | – | hub | → §3 |
| operations | Mexico States | `mexico-states` | – | hub | → §3 |
| operations | Workflow Requests | `workflow-requests` | Y | hub | → §3 |
| operations | Fuel (hub label) | `fuel` | Y | hub | **404 — not a list endpoint** |

## 3. Live classification — GUARD probe, 2026-06-20 (api.ih35dispatch.com, OC TRANSP)
Results below are **live-measured by GUARD's authed run** (the coder has no session and embeds no token —
§1.5/§1.6 — so these are GUARD's numbers, not guessed).

**Registry (8 registered catalogs):** **6 WORK-WITH-DATA · 2 WORK-EMPTY (accounting).**
- WORK-WITH-DATA: Chart of Accounts, Classes, Items, Payment Terms, Equipment Types, Driver Load Statuses.
- WORK-EMPTY (accounting → **Lane B**): Posting Templates, Account Role Bindings.

**Work-empty tables WITH an existing endpoint** (`{table, rows:[]}` — populate-ready, the Tier-A2 head):
- Parts (`parts`) · Labor Rates (`labor-rates`) · Leave Policies (`leave-policies`).

**STUB — 404, no endpoint** (UI expects them; backend missing → greenfield endpoint+page):
- trailer-types · cargo-types · inspection-types · violation-types · services.

**Corrected totals** (replaces the stale 2026-06-01 `65 / 15 / 16 / 34`):
- **Registry = 8** (6 work-with-data, 2 work-empty).
- Live-measured beyond registry: **3 work-empty-with-endpoint** + **5 greenfield 404 stubs**.
- The remaining `/api/v1/catalogs/*` endpoints in §2 are **LIVE-PENDING** — run the full auditor below to
  lock them; **not guessed here.**

> **Reconcile note:** the 5 404 catalogs (`trailer-types`/`cargo-types`/`inspection-types`/`violation-types`/`services`)
> are **not** in §2's endpoint list — they are UI-expected catalogs with **no backend route**, distinct from
> the 35 wired endpoints. They need an endpoint **and** a page built (greenfield), not just data.

### Complete the live-pending rows (read-only, GUARD has the session)
`scripts/audit-catalog-inventory.mjs` (GET only, no creds embedded) prints every route's class + totals:
```sh
AUDIT_COOKIE='session=…' AUDIT_BASE_URL=https://api.ih35dispatch.com \
  node scripts/audit-catalog-inventory.mjs                                   # human output
AUDIT_COOKIE='session=…' AUDIT_MARKDOWN=1 node scripts/audit-catalog-inventory.mjs   # markdown table
```
Output ends with `TOTALS: work-with-data=… work-empty=… stub/missing=…`. Unauthed sanity run (A1 PR):
34/35 endpoints exist + require auth; `fuel` 404s (hub label).

## 4. Prioritized A2.. build order — FINALIZED from live data (§3)
Locked from GUARD's live probe. Easiest-real-value first: populate tables that already have an endpoint,
then greenfield the 404 stubs, with financial catalogs routed to Lane B (McLeod/Alvys ops-master-data
first; QBO/NetSuite governs financial reference via ceremony).

**Tier A2 — work-empty tables that ALREADY have an endpoint** (populate + typed catalog UI + inline create;
additive, no migration):
1. **Parts** (`/api/v1/catalogs/parts`) — feeds Work Order line items + cost; highest daily leverage.
2. **Labor Rates** (`/api/v1/catalogs/labor-rates`) — WO labor cost.
3. **Leave Policies** (`/api/v1/catalogs/leave-policies`) — driver leave reference.

**Tier A3 — greenfield 404 stubs** (build the read endpoint + list page + inline create):
4. **trailer-types** · 5. **cargo-types** · 6. **inspection-types** · 7. **violation-types** · 8. **services**
   - Boundary: if the underlying `catalogs.*` table already exists, a read endpoint + page is Lane-A
     additive. If a catalog needs a **new table → that is a migration → STOP for Jorge (not Lane A).**

**LANE B (financial — NOT Lane A):**
- **Posting Templates** and **Account Role Bindings** define **GL posting behavior** (JE templates / which
  accounts each role may post to). Financial cluster → Lane B ceremony; never built in Lane A.

**Live-pending — classify with the full auditor (§3) then slot in:** the remaining §2 endpoints
(`maintenance/parts-master`, `maintenance/services-catalog`, `fleet/equipment-types`, `fleet/tire-positions`,
`safety/*`, the dispatch reason catalogs, `file-categories`, `us-states`, `mexico-states`,
`workflow-requests`, `audit-event-types`, `accounting/journal-entry-types`, `accounting/qbo-categories`).
Accounting ones border the financial cluster — confirm Lane A vs B per-catalog before queueing.

Each A2.. block: one catalog per PR, additive, wired to its `/api/v1/catalogs/<name>` endpoint (read +
inline `+ Add new …`), clickable to a detail/profile where the data warrants. **No** posting/flag; a new
`catalogs.*` table or any GL-posting tie = **not Lane A** (migration/financial → STOP). GUARD specs each
from live.

## 5. Acceptance / scope honored
Read-only audit: **no** route/endpoint/migration/flag/UI-behavior changed. Doc + read-only script only.
Live counts are script-derived (not guessed) per §1.5. tsc N/A (plain `.mjs`).
