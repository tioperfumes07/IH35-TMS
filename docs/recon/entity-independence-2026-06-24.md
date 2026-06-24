# Entity-Independence Recon — Pass 6 (ENTITY-INDEPENDENCE)

**Date:** 2026-06-24
**HARD RULE under audit:** TRK / TRANSP / USMCA share NOTHING. Every entity-scoped table /
resolver / index / unique-constraint MUST be per-entity (partitioned by the operating company),
never global. Find every global object that should be per-entity.

**Method:** schema-level sweep of `db/migrations/*.sql` (495 files). For every `CREATE TABLE`
block: parse columns, detect the per-entity scoping column, confirm RLS-enable + a tenant policy,
and extract UNIQUE constraints/indexes. Cross-referenced against the three entity CI guards and
Pass-3 (`data-source-map-2026-06-24.md`, which covered live UI read paths — this pass covers the
schema/constraint/guard level Pass 3 did not).

**Constraint:** READ-ONLY recon. No code edits, no migrations, no commits. Findings only.
Schema truth = `db/migrations/`. The Path-B `catalogs.accounts` decommingle is a known in-flight
workstream — noted, not re-raised as new.

**Canonical entity ids** (from `verify-multi-entity-separation.mjs`):
TRANSP `91e0bf0a-133f-4ce8-a734-2586cfa66d96` · TRK `b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e` ·
USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`.

---

## HEADLINE FINDINGS

1. **No live cross-entity data leak was found at the schema level.** Every entity-scoped fact
   table is partitioned by an operating company and RLS-protected. Pass 3 found 0 leaks in UI
   read paths; this pass confirms it holds at the constraint/RLS layer too. The risks below are
   **architectural-inconsistency + guard-blind-spot** risks, not active leaks.

2. **TWO scoping-column conventions coexist: `operating_company_id` (≈356 tables) and `tenant_id`
   (24 tables, FK to `org.companies`).** Both partition by the same operating company — the
   `tenant_id` policies all read `tenant_id::text = current_setting('app.operating_company_id')`.
   But the column-name split creates the single biggest **CI-guard blind spot** (see #3).

3. **The real RLS guards key on the literal column name `operating_company_id`, so the 24
   `tenant_id`-scoped tables get NO live RLS audit and NO new-table RLS gate.**
   - `verify:rls-operating-company-scope` queries `pg_attribute WHERE attname='operating_company_id'`
     — `tenant_id` tables are invisible to it.
   - `verify:rls-migration-scan` (Gate 1, baseline #406) only fires on a `CREATE TABLE` containing
     `operating_company_id` — a NEW `tenant_id`-scoped table could merge with RLS OFF and pass.
   - `verify:no-cross-carrier-data-leak` runtime-tests only **2 hardcoded tables**
     (`qbo_sync.drift_log`, `catalogs.complaint_types`).
   - `verify:multi-entity-separation` is a **pure doc-grep** of `docs/specs/MULTI-ENTITY-SEPARATION.md`
     (asserts the spec retains phrases + the 3 entity ids) — nominal only, as Pass-2 noted. It
     proves nothing about the live schema.

4. **`catalogs.accounts.account_number` is a GLOBAL `NOT NULL UNIQUE` constraint** (the chart-of-
   accounts code is globally unique, not per-entity). This is the known Path-B item: `operating_company_id`
   + `system_purpose` columns were ADDED (Stage 1, `202606161000`), backfilled to TRANSP (Stage 2),
   and TRK was decommingled by **prefixing** its accounts `TRK-` (Stage 3, locked decision A1 =
   "account_number is globally unique"). The per-entity UNIQUE index (`Stage 4`:
   `UNIQUE(operating_company_id, system_purpose)`) and USMCA seed (`Stage 5`) are **NOT yet landed**.
   So the global UNIQUE remains by design today, worked around via prefixing. Tracked, financial-cluster,
   never self-merge.

5. **0385 `_rls_audit_all_tables.sql` has a dynamic DO-block sweep** that, at migration time,
   ENABLE+FORCE RLS and adds a standard tenant policy to **every** table with an `operating_company_id`
   column lacking RLS/policy. This is why several tables whose *original* `CREATE` had no inline RLS
   (e.g. `safety.internal_fines`, `maintenance.work_orders`, `catalogs.complaint_types`) are in fact
   RLS-protected at runtime. **0385's sweep also keys on `operating_company_id` only** — it does NOT
   cover `tenant_id` tables (those got their RLS in their own create migrations, which is good, but
   means the safety-net does not extend to them).

---

## OBJECT TABLE (representative — full per-table data in scratchpad analysis)

| Object | Entity-scoped? | RLS? | Covered by CI guard? | FLAG + severity | Migration ref |
|---|---|---|---|---|---|
| ~356 `operating_company_id` tables (loads, invoices, bills, payments, JEs, settlements, incidents, bank_txns, safety.*, dispatch.*, maintenance.*, …) | per-entity | YES (inline or via 0385 sweep) | `verify:rls-operating-company-scope` (live, audits ALL such tables) + `verify:rls-migration-scan` (new-table gate) | OK | various |
| **`catalogs.accounts`** | per-entity (Stage 1+) but **global UNIQUE on `account_number`** | YES (RLS in 0010 + grants) | NOT in the 2-table leak test; Path-B has bespoke stage verifies | **FLAG global-unique COA code — HIGH (known/tracked, financial)** | 0010 + `202606161000/100/200` Stage 1-3 |
| `accounting.coa_account` (PS mirror) | per-entity via **`tenant_id`** | YES (0265) | NONE (tenant_id blind spot) | **FLAG no-entity-guard — MED** | 0265_ps_mirror.sql |
| `accounting.ps_category` / `ps_item` / `pse_posting_policy` / `vendor_subtype_pse_map` / `bill_unit_allocation` | per-entity via **`tenant_id`** | YES | NONE | **FLAG no-entity-guard — MED** | 0264-0266 |
| `factoring.factor` / `batch` / `reserve_movement` / `customer_factor_assignment` / `bank_match_suggestion` | per-entity via **`tenant_id`** | YES | NONE | **FLAG no-entity-guard — MED** (financial) | 0286-0289 |
| `insurance.policy` / `policy_unit` / `claim` / `lawsuit` / `coi_request` / `payment_schedule` / `refund_obligation` / `type_catalog` | per-entity via **`tenant_id`** | YES | NONE | **FLAG no-entity-guard — MED** | 0274-0285, 202606072350 |
| `mdata.assets` / `asset_status_history` | per-entity via **`tenant_id`** | YES | NONE | **FLAG no-entity-guard — MED** | 0262-0263 |
| `maint.part` / `pm_schedule` / `part_position_assignment` / `position_set` / `position_history` | per-entity via `tenant_id` (part/pm) or `operating_company_id` (maint.*) | YES | partial (`maint.*` opco tables covered) | **FLAG no-entity-guard (part/pm) — MED** | 0272, 202606122215/30 |
| `integrity.anomalies` | per-entity via **`tenant_id`** | YES | NONE | **FLAG no-entity-guard — LOW** | 0280_integrity_anomaly.sql |
| `mdata.units` | owner/lease scoping (`owner_company_id` / `currently_leased_to_company_id`, NO `operating_company_id` by §4 design) | n/a (read-path scoped) | `verify:units-no-operating-company-id` (asserts it must NOT have the column) | OK (canonical §4 pattern) | 0008_mdata_init.sql |
| `catalogs.us_states` / `mexico_states` / `account_types` / `detail_types` / `payment_terms` / `equipment_types` / `posting_templates` | GLOBAL **by design** (shared reference data, not entity-specific) | mixed (RLS on, FOR ALL true) | n/a | OK (reference catalog — not per-entity data) | 0010, 0017, 0024, 202606080010 |
| `audit.row_changes` | global append-only audit (has `tenant_id` for attribution) | append-only guard | `verify:canonical-audit-table-name` | OK (cross-entity audit spine, intentional) | 0001/0002 |

---

## "GLOBAL-SHOULD-BE-PER-ENTITY" — RANKED LIST

**Definition:** an object holding entity-specific data that is NOT partitioned by an operating
company (no `operating_company_id` AND no `tenant_id`), OR a UNIQUE key that is global where the
business meaning is per-entity. After verification, **only ONE true case exists**, and it is the
already-tracked Path-B item:

1. **`catalogs.accounts.account_number` — GLOBAL `NOT NULL UNIQUE`** (`0010_catalogs_init.sql:8`).
   HIGH but **KNOWN / IN-FLIGHT (Path B)**. The COA code is globally unique; two entities cannot
   reuse "1000". Path-B Stage 1-3 already added `operating_company_id`/`system_purpose`, backfilled
   TRANSP, and decommingled TRK via `TRK-` prefix (locked decision A1). **Remaining gap:** Stage 4
   per-entity UNIQUE `(operating_company_id, system_purpose)` index + #6999 runtime guard NOT landed;
   Stage 5 USMCA seed NOT landed. Financial-cluster, GUARD-gated, never self-merge. **No action by
   recon — flagged for completeness only.**

> **No other genuine global-should-be-per-entity object was found.** The original raw scan's
> "global" candidates (`factoring.*`, `insurance.*`, `mdata.assets`, `accounting.coa_account`,
> `ifta.*`) ALL turned out to be per-entity via `tenant_id` (or `operating_company_id` for ifta) —
> they are scoped, just under a different column name. They are the "no-entity-guard" list below,
> not leaks.

---

## "ENTITY-SCOPED TABLES NOT COVERED BY ANY ENTITY CI GUARD" (the `tenant_id` blind spot)

These 24 tables ARE per-entity (RLS keys `tenant_id::text = app.operating_company_id`) but are
invisible to `verify:rls-operating-company-scope` (audits `operating_company_id` column only),
`verify:rls-migration-scan` (new-table gate fires on `operating_company_id` only), and the 0385
auto-RLS sweep. Severity reflects financial/safety sensitivity:

| Table | Severity | Note |
|---|---|---|
| `accounting.coa_account` | HIGH | GL account mirror — financial |
| `accounting.ps_category`, `accounting.ps_item` | HIGH | product/service mirror — financial |
| `accounting.pse_posting_policy`, `accounting.vendor_subtype_pse_map` | HIGH | posting policy — financial |
| `accounting.bill_unit_allocation` | HIGH | bill→unit cost allocation — financial |
| `factoring.factor`, `factoring.batch`, `factoring.reserve_movement`, `factoring.customer_factor_assignment`, `factoring.bank_match_suggestion` | HIGH | factoring money paths — financial |
| `insurance.policy`, `insurance.policy_unit`, `insurance.claim`, `insurance.lawsuit`, `insurance.coi_request`, `insurance.payment_schedule`, `insurance.refund_obligation`, `insurance.type_catalog` | MED | policy/claim/legal-evidence |
| `mdata.assets`, `mdata.asset_status_history` | MED | asset registry |
| `maint.part`, `maint.pm_schedule` | MED | maintenance parts/PM (note: `maint.*` positioned-parts use `operating_company_id` and ARE covered) |
| `integrity.anomalies` | LOW | integrity findings |

**Recommended remediation (for Jorge to decide — NOT applied):** extend the entity RLS guards to
ALSO audit tables whose scoping column is `tenant_id` (or normalize the column name to
`operating_company_id`). Lowest-risk option: add `tenant_id` to the `pg_attribute` predicate in
`verify-rls-operating-company-scope.mjs` and the create-block regex in `verify-rls-migration-scan.mjs`.
Both are CI-guard changes (non-financial code), but they audit financial tables — surface to Jorge.

---

## UNIQUE CONSTRAINTS / INDEXES NOT ENTITY-PARTITIONED — RISK ASSESSMENT

The sweep found ~24 UNIQUE indexes + ~14 inline UNIQUE constraints on entity-scoped tables that do
NOT include the scoping column. **After classification, none is a true cross-entity collision bug**
because each is keyed on an FK that is itself single-entity-owned (transitively partitioned):

| Constraint | Keyed on | Verdict |
|---|---|---|
| `dispatch.load_id_reservations UNIQUE(operating_company_id, reserved_load_number)` | INCLUDES opco | **CORRECT** — per-entity load-number reservation |
| `factoring.factor UNIQUE(tenant_id, name)`, `factoring.batch UNIQUE(tenant_id, batch_number)` | INCLUDES tenant_id | **CORRECT** — per-entity |
| `driver_pwa.push_subscriptions UNIQUE(endpoint)` | global push endpoint | OK — a browser push endpoint is globally unique by nature |
| `shipper_portal.portal_users UNIQUE(lower(email))` | global login email | OK — external portal login identity |
| `mdata.driver_teams uniq_driver_in_active_team_*(driver_id)` | driver_id (entity-owned) | OK — transitively per-entity |
| `banking.bank_transactions UNIQUE(bank_account_id, dedup_hash)` | bank_account_id (opco-scoped) | OK — transitively per-entity |
| `accounting.payment_applications UNIQUE(payment_id, …)` / `UNIQUE(payment_id, invoice_id)` | payment_id (opco-scoped) | OK |
| `bank.reconciliation_matches UNIQUE(bank_transaction_id, …)` | txn (opco-scoped) | OK |
| `driver_finance.team_settlement_splits UNIQUE(load_id, driver_id)`, `dispatch.load_cancellations UNIQUE(load_id)` | load_id (opco-scoped) | OK |
| `mdata.unit_plates / equipment_plates UNIQUE(unit_id, country, jurisdiction)` | unit (owner/lease-scoped) | OK |
| `fixed_assets.depreciation_schedules UNIQUE(asset_id, period_number)`, `finance.loan_amortization_rows UNIQUE(loan_id, payment_number)` | asset/loan (opco-scoped) | OK |
| `search.universal_index UNIQUE(entity_type, entity_uuid)` | global uuid PK refs | OK — uuid is globally unique |
| **`catalogs.accounts UNIQUE(account_number)`** | global COA code | **the one structural global business-key — Path-B item #4 above** |

**Net: 0 new cross-entity unique-collision bugs.** The only structurally-global business-key UNIQUE
is `catalogs.accounts.account_number`, already the tracked Path-B item.

---

## RESOLVER SPOT-CHECK

Pass 3 already traced live UI read paths (0 global-should-be-per-entity in reads). Confirmed at the
schema level: resolvers reading `operating_company_id` tables go through `SET LOCAL
app.operating_company_id` + RLS or explicit `WHERE`, and the `tenant_id` tables' RLS policies bind
`tenant_id::text = current_setting('app.operating_company_id')` — so even a resolver that forgets an
explicit filter is still RLS-partitioned, PROVIDED the app runs as `ih35_app` (not `neondb_owner`).
The Path-B expense-category resolver (`resolveAccountForCategory`, doc CLAUDE.md §16) reads
`accounting.expense_category_account_map` (opco-scoped) → FK into `catalogs.accounts` (now
opco-scoped). The standing `ih35_app`-not-`neondb_owner` invariant (#878) is the load-bearing
assumption for the `tenant_id` tables since no CI guard re-verifies their RLS live.

---

## SUMMARY OF SEVERITY

- **HIGH (known/tracked):** `catalogs.accounts` global COA-code UNIQUE + pending Path-B Stage 4/5.
- **MED (new finding, structural):** 24 `tenant_id`-scoped tables (incl. all of `factoring.*`,
  `accounting.coa_account/ps_*/pse_*`, `insurance.*`, `mdata.assets`) have NO live entity RLS audit
  and NO new-table RLS gate — a guard blind spot, not an active leak.
- **LOW (nominal):** `verify:multi-entity-separation` is doc-grep only; `verify:no-cross-carrier-data-leak`
  tests only 2 tables. Neither proves schema-wide isolation.

**Recon only. No code, schema, or migration was changed. GUARD verifies read-only on Neon; Jorge decides.**
