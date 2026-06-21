# Catalog Inventory & STUB Build Order — 2026-06-20 (live `20e0415`)

**Block:** Lane A · A1 (CATALOG-AUDIT-LIVE) · Tier 3 read-only audit · ships a truth doc, no app-behavior change.
**Purpose:** authoritative inventory of catalog surfaces + a prioritized build order for the STUBs — the
A2.. build queue. Built from live truth + repo, not the stale 2026-06-01 memory count (65/15/16/34).

> **Integrity note — why the live-count column says "run the script."** The 3-way classification
> WORK-WITH-DATA / WORK-EMPTY / STUB depends on **live OC-scoped row counts** (work-empty and
> work-with-data are the *same code*, different data). Direct prod access is gated (CLAUDE.md §1.5), so
> **no count here is guessed.** Counts are derived by running the read-only auditor with a session — see
> §3. Everything else below (names, routes, endpoints, OC-scoping, dedicated-page-vs-hub) is repo-truth at
> `20e0415` and is authoritative as-is.

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
A live authed run (§3) fills the **Class** + **Count** columns; unauthed, every row is AUTH-REQUIRED
except `fuel` which 404s (it's a hub label, not a list endpoint).

| Dept | Catalog | Endpoint (`/api/v1/catalogs/…`) | OC | Dedicated page | Class (live → §3) |
|---|---|---|---|---|---|
| accounting | Chart of Accounts | `accounts` | Y | `/catalogs/accounts` | _run script_ |
| accounting | Classes | `classes` | Y | `/catalogs/classes` | _run script_ |
| accounting | Items | `items` | Y | `/catalogs/items` | _run script_ |
| accounting | Payment Terms | `payment-terms` | Y | `/catalogs/payment-terms` | _run script_ |
| accounting | Posting Templates | `posting-templates` | Y | `/catalogs/posting-templates` | _run script_ |
| accounting | Account Role Bindings | `account-role-bindings` | Y | `/catalogs/account-role-bindings` | _run script_ |
| accounting | Journal Entry Types | `accounting/journal-entry-types` | Y | hub | _run script_ |
| accounting | QBO Categories | `accounting/qbo-categories` | Y | hub | _run script_ |
| dispatch | Equipment Types | `equipment-types` | Y | `/catalogs/equipment-types` | _run script_ |
| dispatch | Driver Load Statuses | `driver-load-statuses` | Y | `/catalogs/driver-load-statuses` | _run script_ |
| dispatch | Cancellation Reasons | `cancellation-reasons` | – | hub | _run script_ |
| dispatch | Load Cancellation Reasons | `load-cancellation-reasons` | Y | hub | _run script_ |
| dispatch | Dispatch Flag Colors | `dispatch-flag-colors` | Y | hub | _run script_ |
| dispatch | Dispatcher Error Reasons | `dispatcher-error-reasons` | Y | hub | _run script_ |
| dispatch | Customer Quality Event Reasons | `customer-quality-event-reasons` | Y | hub | _run script_ |
| driver | Driver Leave Balances | `driver-leave-balances` | Y | hub | _run script_ |
| driver | Leave Policies | `leave-policies` | Y | hub | _run script_ |
| driver | Driver Termination Reasons | `driver-termination-reasons` | Y | hub | _run script_ |
| fleet | Fleet Equipment Types | `fleet/equipment-types` | Y | hub | _run script_ |
| fleet | Tire Positions | `fleet/tire-positions` | Y | hub | _run script_ |
| maintenance | Parts | `parts` | Y | hub | _run script_ |
| maintenance | Parts Master | `maintenance/parts-master` | Y | hub | _run script_ |
| maintenance | Services Catalog | `maintenance/services-catalog` | Y | hub | _run script_ |
| maintenance | Labor Rates | `labor-rates` | Y | hub | _run script_ |
| maintenance | Maintenance Part Locations | `maintenance-part-locations` | Y | hub | _run script_ |
| safety | Complaint Types | `complaint-types` | Y | hub | _run script_ |
| safety | Civil Fine Types | `safety/civil-fine-types` | Y | hub | _run script_ |
| safety | Company Violation Types | `safety/company-violation-types` | Y | hub | _run script_ |
| safety | Internal Fine Reasons | `safety/internal-fine-reasons` | Y | hub | _run script_ |
| operations | Audit Event Types | `audit-event-types` | – | hub | _run script_ |
| operations | File Categories | `file-categories` | Y | hub | _run script_ |
| operations | US States | `us-states` | – | hub | _run script_ |
| operations | Mexico States | `mexico-states` | – | hub | _run script_ |
| operations | Workflow Requests | `workflow-requests` | Y | hub | _run script_ |
| operations | Fuel (hub label) | `fuel` | Y | hub | **404 — not a list endpoint** |

## 3. Deriving the live counts (GUARD/Jorge — has the session)
`scripts/audit-catalog-inventory.mjs` is a **read-only** enumerator (GET only, no creds embedded). It calls
`/registry` (authoritative item_counts) + probes every endpoint above, classifies by live count, and prints
totals. Run with your own session:
```sh
AUDIT_COOKIE='session=…' AUDIT_BASE_URL=https://api.ih35dispatch.com \
  node scripts/audit-catalog-inventory.mjs          # human output
AUDIT_COOKIE='session=…' AUDIT_MARKDOWN=1 node scripts/audit-catalog-inventory.mjs   # markdown table
```
Output ends with `TOTALS: work-with-data=… work-empty=… stub/missing=…` — paste those into this doc to
finalize the corrected live count (replacing the 2026-06-01 65/15/16/34 figures). Unauthed sanity run
(this PR): 34/35 endpoints exist + require auth; `fuel` 404s.

## 4. Prioritized STUB build order (the A2.. queue)
Apply this priority to whatever §3's live run flags as **STUB** or **WORK-EMPTY** (build the operationally
load-bearing catalogs the daily Laredo↔MX ops depend on before rarely-touched reference lists). Ordering
rationale follows McLeod/Alvys (ops-master-data first) + QBO/NetSuite (financial reference data governed,
later):

1. **Maintenance (daily shop ops):** Parts, Parts Master, Services Catalog, Labor Rates, Maintenance Part
   Locations — these feed Work Orders (the WO line items + cost). Highest daily leverage.
2. **Fleet:** Fleet Equipment Types, Tire Positions — feed unit/maintenance records.
3. **Dispatch:** Cancellation Reasons, Load Cancellation Reasons, Dispatch Flag Colors, Dispatcher Error
   Reasons, Customer Quality Event Reasons — feed the live board + load lifecycle.
4. **Driver:** Driver Termination Reasons, Leave Policies, Driver Leave Balances — feed driver lifecycle +
   settlements adjacency (non-financial reference only).
5. **Safety/compliance:** Complaint Types, Civil Fine Types, Company Violation Types, Internal Fine Reasons
   — feed the Safety module's 21 tabs.
6. **Operations reference (low churn):** File Categories, Audit Event Types, Workflow Requests, US/Mexico
   States — mostly static; build last.
7. **Accounting reference:** Journal Entry Types, QBO Categories — **review before building**: these border
   the financial cluster. A catalog that only *labels* is Tier-3; anything that drives posting/GL is **not
   Lane A** (→ Lane B ceremony). Confirm per-catalog before queueing.

Each A2.. block: one catalog per PR, additive, wired to its existing `/api/v1/catalogs/<name>` endpoint
(read + the inline `+ Add new …` create), clickable to a detail/profile where the data warrants, no
posting/migration/flag. GUARD specs each from live once §3 confirms its class.

## 5. Acceptance / scope honored
Read-only audit: **no** route/endpoint/migration/flag/UI-behavior changed. Doc + read-only script only.
Live counts are script-derived (not guessed) per §1.5. tsc N/A (plain `.mjs`).
