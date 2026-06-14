# RLS-Coverage Audit — tenant-isolation inventory

**Status:** Read-only audit / docs only (NO fixes in this block — GUARD #33 / Wave-5 Block N).
**Audience:** Jorge + GUARD (security prioritization).
**Date:** 2026-06-14
**Scope:** Inventory of tenant-scoped tables (have `operating_company_id`) and whether each enforces row-level security keyed on the tenant. Money + PII tables first.

---

## 0. Why this audit

Cross-tenant isolation in this app relies on Postgres RLS: a tenant-scoped table must `ENABLE ROW LEVEL SECURITY` (+ `FORCE`) **and** carry a policy that filters on `operating_company_id` (typically `NULLIF(current_setting('app.operating_company_id', true), '')::uuid`). A tenant-scoped table with no such policy is a **cross-tenant exposure risk** — one company could read/write another's rows.

This is a **prioritization inventory only**. No policies are added here; remediation lands as separate, per-schema, tested follow-up blocks once Jorge ranks the list.

---

## 1. Summary (scan of `db/migrations/*.sql`)

| Metric | Count |
|---|---|
| Total tables created | ~446 |
| Tenant-scoped (`operating_company_id`) | ~333 |
| Global-by-design (no tenant column) | ~113 |
| **RLS-COVERED** (ENABLE RLS + tenant policy) | ~149 |
| **RISKY** (ENABLE RLS, but no verified tenant policy) | ~184 |
| **CRITICAL** (tenant-scoped, **no RLS at all**) | **8** |

> **Methodology caveat (read before remediating):** this is a static scan of migration SQL. A table flagged "RISKY (no verified policy)" may have its policy defined in a *later/separate* migration or a shared grants/policy migration that the scan did not associate. **Each flagged table must be re-verified against the live DB (`pg_policies`) before any fix.** Treat the lists below as the candidate set to verify, ranked by blast radius — not a confirmed-broken list.

---

## 2. CRITICAL — tenant-scoped tables with ZERO RLS (verify first)

All from the pre-gate baseline migration `0050_two_section_v5_and_safety_restructure.sql` (+ one from `0145`):

| # | Table | Sensitivity | Migration |
|---|---|---|---|
| 1 | `safety.internal_fines` | **PII + financial** (driver fines) | 0050 |
| 2 | `catalogs.labor_rates` | financial (rate data) | 0050 |
| 3 | `catalogs.parts` | operational | 0050 |
| 4 | `catalogs.maintenance_part_locations` | operational | 0050 |
| 5 | `catalogs.complaint_types` | reference (likely should be global) | 0050 |
| 6 | `catalogs.internal_fine_reasons` | reference | 0050 |
| 7 | `catalogs.company_violation_types` | reference | 0050 |
| 8 | `maintenance.work_order_seq_per_month` | operational (sequence) | 0145 |

*Note:* several `catalogs.*` rows here may be **intended global reference** (no tenant isolation needed) — confirm whether they actually carry `operating_company_id` and should be tenant-scoped, vs. being global catalogs. `safety.internal_fines` is the clear must-fix (PII + money).

---

## 3. HIGH-RISK — "RISKY" tables holding MONEY (verify + prioritize)

Tenant-scoped, RLS enabled but **no tenant policy verified** by the scan. Money-bearing schemas:

**accounting (~17):** `bills`, `bill_payments`, `journal_entries`, `journal_entry_postings`, `posting_batches`, `escrow_accounts`, `escrow_postings`, `factoring_advances`, `ar_collection_tasks`, `cash_flow_adjustments`, `cash_forecast_settings`, `customer_classifications`, `vendor_classifications`, `transaction_source_links`, `outbox_events`, `qbo_remote_counts`, `qbo_remote_count_collection_state`.
**driver_finance (~13):** `driver_settlements`, `driver_settlement_deductions`, `driver_settlement_disputes`, `settlement_disputes`, `settlement_payment_events`, `team_settlement_splits`, `escrow_balances`, `escrow_ledger`, `escrow_deductions_pending`, `abandonment_chargebacks`, `abandonment_defaults`, `cash_advance_owner_approval_audit`, `trip_link_queue`.
**banking (~8):** `bank_accounts`, `bank_transactions`, `transfers`, `transaction_categories`, `reconciliation_sessions`, `equipment_loans`, `equipment_loan_payments`, `equipment_loan_attributions`.
**factor (~4):** `faro_daily_imports`, `faro_invoice_lines`, `reconciliation_runs`, `reconciliation_items`.
**payroll / settlement / qbo / maintenance (~6):** `payroll.driver_settlement_line_items`, `payroll.driver_settlements`, `settlement.settlement`, `settlement.settlement_line`, `qbo.bill_payment_mappings`, `maintenance.parts_invoice_links`.

→ ~48 money tables to verify. **Highest blast radius** — a missing policy here = one tenant could see/modify another's books.

---

## 4. HIGH-RISK — "RISKY" tables holding PII / compliance

**compliance (~4):** `dot_inspection_events`, `dot_inspection_event_followups`, `csa_basic_scores`, `csa_mitigation_actions`.
**identity (~2):** `driver_applicants`, `applicant_documents`.
**safety (~1):** `compliance_reminders`.

→ ~7 PII/compliance tables to verify.

---

## 5. Operational (~129 "RISKY")

The remaining flagged tables are operational (safety, maintenance, dispatch, integrations, master-data, etc.). Lower sensitivity than §3/§4 but still tenant-scoped — verify in a later pass. (Full per-schema list available from the scan; omitted here to keep the priority list legible.)

---

## 6. Global-by-design (NOT gaps)

~113 tables have **no** `operating_company_id` and are global by design — e.g. `catalogs.accounts` (single global chart), `org.companies`, reference catalogs, system/migration ledgers. These correctly need no tenant RLS.

---

## 7. Existing guards (what's already enforced)

- `scripts/verify-rls-migration-scan.mjs` — **baseline migration #406**: blocks any *new* tenant-scoped table (above #406) that lacks `ENABLE RLS`. ✅ prevents new gaps. ✗ does **not** check that a tenant *policy* exists, and ✗ does not cover the ~pre-#406 tables in §2–§5.
- `scripts/sec-audit-rls-policies.mjs`, `scripts/db-verify-rls-cross-tenant-gate.mjs`, `scripts/db-verify-*-rls.*` (per-schema: catalogs, identity, mdata, factoring, form-425c, bill-expense-lines, …) — targeted live checks; not a whole-DB policy-presence sweep.

**Gap in the guards themselves:** nothing asserts *policy presence keyed on operating_company_id* across **all** tenant-scoped tables. A natural remediation by-product is to extend `verify-rls-migration-scan.mjs` (or add a new guard) to assert policy presence, and drop the #406 baseline once §2–§5 are closed.

---

## 8. Recommended next steps (NOT done here)

1. **Verify, don't trust the scan:** run a live `pg_policies` check for every table in §2–§5; drop any that actually have a policy (likely a chunk of the 184).
2. **Fix order by blast radius:** §2 CRITICAL (esp. `safety.internal_fines`) → §3 money → §4 PII → §5 operational.
3. **Each fix = its own tested block** (per-schema): `ENABLE/FORCE RLS` + tenant policy (`NULLIF(...)::uuid` pattern) + a lucia-bypass policy where the app needs it + a per-table verify guard. Migrations → Jorge in accept-edits.
4. **Harden the guard:** extend the RLS verify to assert *policy presence* (not just ENABLE), then retire the #406 baseline.

---

*Read-only audit. No schema or policy changes are made by this document. Remediation is sequenced separately under Jorge's standing rules (migrations in accept-edits, per-schema tested blocks, never self-merge).*
