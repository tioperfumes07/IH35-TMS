# USMCA U1 — Entity Isolation Classification (GUARD review gate)

**Status:** CLASSIFICATION ONLY — no migrations in this PR.  
**Date:** 2026-07-15  
**Prod evidence cited by owner:** Neon branch `br-fancy-credit-akjnd07a`  
**USMCA:** `5c854333-6ea5-4faa-af31-67cb272fef80` (greenfield, no QBO, clean single book)  
**Goal:** with `app.operating_company_id = USMCA`, every module returns ONLY USMCA rows — zero TRANSP/TRK bleed.

**Repo reconciliation (this agent, 2026-07-15):** table list reconstructed from
`docs/schema-parity-baseline.json` (generated 2026-07-15) + P1 “no scoping column” entries in
`scripts/entity-isolation-allowlist.json`, then filtered to match the owner’s live count of **74**:

| Schema | Count | Filter notes |
|---|---:|---|
| accounting | 11 | excludes RETIRE `accounting.qbo_{accounts,customers,vendors}` |
| insurance | 8 | all already carry `tenant_id` |
| factoring | 6 | all already carry `tenant_id` |
| maintenance | 2 | child tables of `work_orders` |
| dispatch | 1 | `load_eta_predictions` only; excludes RETIRE `dispatch.loads` |
| mdata | 16 | includes dual-ownership landmines `units` / `equipment` |
| catalogs | 30 | includes 9 allowlist-only names not in schema-parity baseline |
| **TOTAL** | **74** | |

**Migration numbering (when GUARD approves):** strictly **above `202607480000`**, sequential, no reuse.
Main max at classification time: `202607470000`.

**Also required by U1 (separate from the 74):** `public.audit_log` + partitions ENABLE+FORCE RLS;
`events.event_log` FORCE RLS (see Landmines — blocked until spine writers re-verified).

---

## Classification legend

| Class | Meaning | Action |
|---|---|---|
| **GLOBAL** | Shared reference / identical across entities by law or physics | Leave shared; ensure entry in `entity-isolation-allowlist.json` → `global` with reason; do **not** add `operating_company_id` |
| **ENTITY-DATA** | Business rows belonging to one company | Add `operating_company_id uuid` (nullable→backfill→NOT NULL only at 0-NULL) + FK → `org.companies(id)` + ENABLE+FORCE RLS with Form 1 predicate |
| **ENTITY-DATA (tenant_id synonym)** | Already entity-scoped via `tenant_id` | **Do not add a second column.** Verify FK + FORCE + Form 1 on `tenant_id`. Optional later rename is out of U1 scope |
| **ENTITY-DATA (dual-ownership)** | `owner_company_id` + `currently_leased_to_company_id` | **Do not add `operating_company_id`.** Needs dual-scope RLS design (owner/lessee membership) — architecture decision before DDL |
| **ENTITY-DATA (child)** | No natural company column; inherits via parent FK | Add `operating_company_id`, backfill via parent path; FORCE RLS |

**Canonical FORCE predicate (Form 1):**
```sql
identity.is_lucia_bypass()
OR operating_company_id::text = current_setting('app.operating_company_id', true)
```
(For `tenant_id` synonym tables, substitute `tenant_id` for `operating_company_id`.)

**Backfill rule:** no-derivable-entity rows stay **NULL** and are listed for owner classification. `NOT NULL` only after 0-NULL.

**Conservative rule:** when unsure → ENTITY-DATA (never silently GLOBAL).

---

## A. ACCOUNTING (11)

| # | Table | Class | Scope plan / backfill path |
|---:|---|---|---|
| 1 | `accounting.ar_collection_contacts` | ENTITY-DATA | Add `operating_company_id`; backfill via customer / AR contact parent → company |
| 2 | `accounting.bill_lines` | ENTITY-DATA (child) | Add opco; backfill `bill_id → accounting.bills.operating_company_id` |
| 3 | `accounting.bill_unit_allocation` | ENTITY-DATA (tenant_id synonym) | Keep `tenant_id`; verify FK→`org.companies` + FORCE + Form 1 on `tenant_id` |
| 4 | `accounting.coa_account` | ENTITY-DATA (tenant_id synonym) | Legacy/parallel COA row? Keep `tenant_id` wall; GUARD confirm vs canonical `catalogs.accounts` (already opco-scoped). No new opco column |
| 5 | `accounting.expense_lines` | ENTITY-DATA (child) | Add opco; backfill via expense/bill parent → company |
| 6 | `accounting.line_category_load_required` | ENTITY-DATA *or GLOBAL* — **GUARD pick** | If this is a posting rule matrix per entity → ENTITY-DATA + seed per entity. If identical universal category→load-required flags → GLOBAL. Default recommendation: **ENTITY-DATA** (posting rules) |
| 7 | `accounting.ps_category` | ENTITY-DATA (tenant_id synonym) | Keep `tenant_id`; verify FORCE+FK |
| 8 | `accounting.ps_item` | ENTITY-DATA (tenant_id synonym) | Keep `tenant_id`; verify FORCE+FK |
| 9 | `accounting.pse_posting_policy` | ENTITY-DATA (tenant_id synonym) | Keep `tenant_id`; verify FORCE+FK (posting policy is entity-owned) |
| 10 | `accounting.recurring_bill_generation_log` | ENTITY-DATA (child) | Add opco; backfill via recurring bill / vendor → company |
| 11 | `accounting.vendor_subtype_pse_map` | ENTITY-DATA (tenant_id synonym) | Keep `tenant_id`; verify FORCE+FK |

**Accounting excluded (not in 74 — RETIRE mirrors):** `accounting.qbo_accounts|qbo_customers|qbo_vendors` — canonical is `mdata.qbo_*`. Do not wall RETIRE tables; do not write to them.

---

## B. INSURANCE (8) — all already `tenant_id`

| # | Table | Class | Scope plan |
|---:|---|---|---|
| 1 | `insurance.claim` | ENTITY-DATA (tenant_id synonym) | Verify FK+FORCE+Form 1 on `tenant_id`; no new opco column |
| 2 | `insurance.coi_request` | ENTITY-DATA (tenant_id synonym) | same |
| 3 | `insurance.lawsuit` | ENTITY-DATA (tenant_id synonym) | same |
| 4 | `insurance.payment_schedule` | ENTITY-DATA (tenant_id synonym) | same |
| 5 | `insurance.policy` | ENTITY-DATA (tenant_id synonym) | same |
| 6 | `insurance.policy_unit` | ENTITY-DATA (tenant_id synonym) | same; unit link must not leak cross-entity claims |
| 7 | `insurance.refund_obligation` | ENTITY-DATA (tenant_id synonym) | same |
| 8 | `insurance.type_catalog` | ENTITY-DATA (tenant_id synonym) | Per-entity insurance type catalog (already tenant-scoped). If rows are identical seed, still keep per-tenant copies — do not globalize |

---

## C. FACTORING (6) — all already `tenant_id`

| # | Table | Class | Scope plan |
|---:|---|---|---|
| 1 | `factoring.bank_match_suggestion` | ENTITY-DATA (tenant_id synonym) | Verify FK+FORCE+Form 1 on `tenant_id` |
| 2 | `factoring.batch` | ENTITY-DATA (tenant_id synonym) | same |
| 3 | `factoring.customer_factor_assignment` | ENTITY-DATA (tenant_id synonym) | same |
| 4 | `factoring.factor` | ENTITY-DATA (tenant_id synonym) | same (USMCA may have its own factor later) |
| 5 | `factoring.letter_of_release` | ENTITY-DATA (tenant_id synonym) | same |
| 6 | `factoring.reserve_movement` | ENTITY-DATA (tenant_id synonym) | same |

---

## D. MAINTENANCE (2)

| # | Table | Class | Scope plan / backfill |
|---:|---|---|---|
| 1 | `maintenance.work_order_lines` | ENTITY-DATA (child) | Add opco; backfill `work_order_id → maintenance.work_orders.operating_company_id` |
| 2 | `maintenance.wo_status_history` | ENTITY-DATA (child) | Add opco; backfill via work_order → opco |

Note: parent `maintenance.work_orders` already has `operating_company_id` but is P4 (needs FK) in the isolation backlog — include FK+FORCE fix for the parent in the same migration wave so children can backfill safely.

---

## E. DISPATCH (1)

| # | Table | Class | Scope plan / backfill |
|---:|---|---|---|
| 1 | `dispatch.load_eta_predictions` | ENTITY-DATA (child) | Add opco; backfill via load id → `mdata.loads.operating_company_id` (canonical loads table). Orphan predictions with no load → NULL + list |

Excluded: `dispatch.loads` (RETIRE / non-canonical; canonical = `mdata.loads`).

---

## F. MDATA (16)

| # | Table | Class | Scope plan / backfill |
|---:|---|---|---|
| 1 | `mdata.assets` | ENTITY-DATA (tenant_id synonym) | Keep `tenant_id`; verify FK+FORCE |
| 2 | `mdata.asset_status_history` | ENTITY-DATA (tenant_id synonym / child) | Keep `tenant_id` or backfill from asset → tenant |
| 3 | `mdata.customer_contacts` | ENTITY-DATA (child) | Add opco; backfill `customer_id → mdata.customers.operating_company_id` |
| 4 | `mdata.customer_quality_events` | ENTITY-DATA (child) | Add opco; backfill via customer → opco |
| 5 | `mdata.dispatcher_safety_events` | ENTITY-DATA | Add opco; backfill via dispatcher user → `org.user_company_access` **or** related load/driver; undervable → NULL list |
| 6 | `mdata.driver_cdl_endorsements` | ENTITY-DATA (child) | Add opco; backfill `driver_id → mdata.drivers.operating_company_id` |
| 7 | `mdata.driver_cdl_restrictions` | ENTITY-DATA (child) | same via driver |
| 8 | `mdata.driver_company_authorizations` | ENTITY-DATA | Already has `company_id` — treat as synonym; verify FK+FORCE Form 1/2 on `company_id`. Do **not** add redundant opco unless GUARD wants rename |
| 9 | `mdata.driver_equipment_qualifications` | ENTITY-DATA (child) | Add opco; backfill via driver |
| 10 | `mdata.driver_pay_rates` | ENTITY-DATA (child) | Add opco; backfill via driver (pay rates are entity-owned) |
| 11 | `mdata.driver_safety_events` | ENTITY-DATA (child) | Add opco; backfill via driver |
| 12 | `mdata.equipment` | ENTITY-DATA (dual-ownership) | **NO opco column.** Dual-scope RLS on `owner_company_id` / `currently_leased_to_company_id` ∈ accessible companies (same as units). Architecture decision required |
| 13 | `mdata.equipment_log` | ENTITY-DATA (child) | Add opco **or** dual-scope via equipment owner/lessee; prefer inherit from equipment’s active lessee when set else owner; undervable → NULL list |
| 14 | `mdata.load_stops` | ENTITY-DATA (child) | Add opco; backfill `load_id → mdata.loads.operating_company_id` |
| 15 | `mdata.units` | ENTITY-DATA (dual-ownership) | **NO opco column.** Dual-scope RLS (owner/lessee). See ENTITY-ISOLATION.md landmine |
| 16 | `mdata.workflow_requests` | ENTITY-DATA | Add opco; backfill via subject entity / requester company access; undervable → NULL list |

---

## G. CATALOGS (30)

### G1 — GLOBAL (leave shared) — recommended

| # | Table | Why GLOBAL |
|---:|---|---|
| 1 | `catalogs.account_types` | Universal COA account-type taxonomy (Asset/Liability/Equity/Income/Expense detail types) — identical across entities |
| 2 | `catalogs.audit_event_types` | Universal audit event-type codes |
| 3 | `catalogs.us_states` | Geographic reference |
| 4 | `catalogs.mexico_states` | Geographic reference |
| 5 | `catalogs.tax_form_thresholds` | IRS 1099/1042 thresholds — already in allowlist `global` |
| 6 | `catalogs.tire_positions` | Physical tire position codes on a tractor/trailer — physics, not entity policy |
| 7 | `catalogs.tractor_statuses` | Universal equipment status enum |
| 8 | `catalogs.trailer_statuses` | Universal equipment status enum |
| 9 | `catalogs.asset_statuses` | Universal asset status enum |
| 10 | `catalogs.asset_condition_codes` | Universal condition codes |
| 11 | `catalogs.unit_ownership_types` | Universal ownership-type enum (owned/leased/…) |
| 12 | `catalogs.driver_load_statuses` | Universal driver-load status enum |
| 13 | `catalogs.equipment_types` | Shared equipment-type taxonomy (industry codes) |
| 14 | `catalogs.trailer_types` | Shared trailer-type taxonomy |
| 15 | `catalogs.file_categories` | Shared document category codes |
| 16 | `catalogs.journal_entry_types` | Shared JE type codes (unless entity-custom types exist — GUARD confirm) |
| 17 | `catalogs.catalog_registry` | Meta-registry of catalog definitions — control-plane, not business rows |
| 18 | `catalogs.cancellation_reasons` | **DEPRECATED global** (MULTI-ENTITY-SEPARATION.md). Leave shared; do **not** extend; new surfaces use per-entity `load_cancellation_reasons` / `void_cancel_reasons` |

**Count G1 GLOBAL = 18**

### G2 — ENTITY-DATA (scope + backfill/seed per entity) — recommended

| # | Table | Scope plan |
|---:|---|---|
| 19 | `catalogs.customer_quality_event_reasons` | Per-entity reason catalog (MULTI-ENTITY pattern). Add opco; seed USMCA copy; backfill existing → TRANSP (or owner map) |
| 20 | `catalogs.dispatcher_error_reasons` | same |
| 21 | `catalogs.driver_termination_reasons` | same |
| 22 | `catalogs.wo_cancellation_reasons` | same (WO domain reasons — parallel to load/void reason catalogs) |
| 23 | `catalogs.payment_terms` | Entity business terms; add opco + per-entity rows |
| 24 | `catalogs.payment_methods` | Entity payment-method set (banks/wallets differ); add opco |
| 25 | `catalogs.lease_terms` | Lease product terms can differ by lessor entity (TRK vs others); add opco |
| 26 | `catalogs.equipment_line_item_templates` | Entity WO/estimate templates; add opco |
| 27 | `catalogs.posting_templates` | **Financial** posting templates — must be entity-scoped; add opco |
| 28 | `catalogs.excel_upload_jobs` | Job/run log — ENTITY-DATA; add opco via actor company / upload target |
| 29 | `catalogs.workflow_requests` | Entity workflow queue; add opco |
| 30 | `catalogs.asset_locations` | Yards/shops are entity (or TRK) locations; add opco |

**Count G2 ENTITY-DATA = 12**

---

## H. Outside the 74 — still in U1 acceptance

| Object | Plan |
|---|---|
| `public.audit_log` + monthly partitions | Legacy dead table (SELECT-only for `ih35_app`). U1 asks ENABLE+FORCE RLS. Recommendation: FORCE with a **deny-all except lucia bypass / forensic role** policy (no opco column exists by design). Confirm with GUARD — conflicting prior decision marked it cross-tenant intentional |
| `events.event_log` | Has `operating_company_id` but missing FK + FORCE. FORCE is deliberately blocked (`202607080100_*` placeholder) until spine writers re-verified on Neon. U1 includes FORCE — must be a dedicated migration after GUARD neon-branch proof |
| Parent tables with opco but weak wall (`maintenance.work_orders`, etc.) | Include FK/FORCE hardening in same wave so child backfills are trustworthy |

---

## I. Proposed migration wave plan (AFTER GUARD approves classification)

Numbers reserved **above `202607480000`** (exact filenames assigned at authoring; re-check main max at push):

| Wave | Scope | Notes |
|---|---|---|
| U1-M1 | Catalogs G2 ENTITY-DATA (12) | Additive opco + backfill/seed + FORCE |
| U1-M2 | Accounting true-missing (bill_lines, expense_lines, ar_collection_contacts, recurring_bill_generation_log, + line_category if ENTITY) | Child backfills |
| U1-M3 | Accounting/insurance/factoring/mdata **tenant_id synonym harden** (FK+FORCE only) | No new columns |
| U1-M4 | Maintenance children + parent WO FK harden | |
| U1-M5 | Dispatch load_eta_predictions + mdata children (contacts, stops, driver_*) | |
| U1-M6 | Dual-ownership RLS for `mdata.units` / `mdata.equipment` (+ equipment_log) | Design-approved first |
| U1-M7 | `events.event_log` FORCE (+ FK) | After spine proof |
| U1-M8 | `public.audit_log` FORCE policy | GUARD-approved shape |
| U1-M9 | CI guard: assert USMCA session cannot read TRANSP/TRK rows on wallable modules | `scripts/verify-usmca-entity-bleed.mjs` (fresh-DB + fixture) |

All migrations: build-and-hold. Hand `.sql` + `sha256` to GUARD. Owner applies on Neon. **Never self-merge.**

---

## J. Acceptance criteria (U1)

1. Classification table reviewed + approved by GUARD (this doc).  
2. Migrations authored per approved class only.  
3. Local apply-twice idempotent on throwaway Postgres.  
4. After owner applies on prod: with `SET app.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'`, module queries return **0** TRANSP/TRK rows for ENTITY-DATA tables.  
5. NULL residual rows listed for owner classification before any `NOT NULL` constraint.  
6. `verify:entity-isolation` backlog shrinks; no new violations.

---

## K. Owner HOLD (do not act — restated)

| ID | Question |
|---|---|
| (a) | Are the 83 drivers bulk-created 2026-07-04 real or test rows? |
| (b) | USMCA start date + opening balances (for U3 — agent must not enter balances) |
| (c) | Does USMCA use Relay? (U5 N/A unless yes) |
| (d) | Real MC / USDOT / tax_id when available |

**Posting flags:** leave USMCA flags ON (clean book) but confirm nothing posts cross-entity until U1 lands.

---

## L. Summary counts (proposed)

| Class | Count |
|---|---:|
| GLOBAL (catalogs G1) | 18 |
| ENTITY-DATA new `operating_company_id` | ~28 (acct missing + maint + dispatch + mdata children + catalogs G2; exact after GUARD picks on `line_category_load_required` / `equipment_log`) |
| ENTITY-DATA tenant_id/company_id synonym harden (no new column) | 8 insurance + 6 factoring + 6 accounting-tenant + 2 mdata-tenant + 1 driver_company_authorizations ≈ 23 |
| ENTITY-DATA dual-ownership (no opco column) | 2 (`units`, `equipment`) |
| **Total in 74** | **74** |

---

## M. GUARD review checklist

- [ ] Confirm 74-table membership matches live prod (`br-fancy-credit-akjnd07a`)  
- [ ] Confirm GLOBAL list (especially `journal_entry_types`, `payment_methods`, `file_categories`, `equipment_types`)  
- [ ] Confirm **no second column** on `tenant_id` tables (insurance/factoring/…)  
- [ ] Confirm dual-ownership RLS approach for units/equipment  
- [ ] Confirm `public.audit_log` FORCE shape vs prior “legacy dead / cross-tenant intentional” decision  
- [ ] Confirm `events.event_log` FORCE unblocked  
- [ ] Approve → coder authors U1-M1… migrations above `202607480000`

**STOP — waiting for GUARD classification approval before any DDL.**
