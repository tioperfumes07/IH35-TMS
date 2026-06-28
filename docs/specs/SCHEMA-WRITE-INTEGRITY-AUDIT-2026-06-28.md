# Schema Write-Integrity Audit + Permanent Gate (2026-06-28)

**Problem (Jorge):** recurring table/column confusion — code writes/posts to tables or columns that don't
exist in the migrated schema; it only surfaces as a runtime 500 (Postgres 42703 undefined column / 42P01
undefined table). The pre-existing `verify-backend-column-references` guard only scanned `identity`+`auth`,
so dispatch/accounting/banking/driver-finance/payroll/safety writes (incl. GL posting) were **unguarded**.

**What was done:** a comprehensive auditor — `scripts/verify-sql-write-targets.mjs` — that scans **every
schema-qualified `INSERT INTO s.t (cols…)` and `UPDATE s.t SET col=…` across the entire backend** (748 INSERT +
948 UPDATE targets) and checks each table + column against the **authoritative migrated schema** (a
fresh-migrated DB's `information_schema` — NOT the schema-parity baseline, which proved incomplete: its parser
missed migration 0392). It is a **ratchet gate**: a known-debt allowlist of the current findings may only
SHRINK; **any NEW phantom write fails CI**. The door is locked against future drift today.

## Root cause #1 (STRUCTURAL) — two migration directories; 10 files NEVER applied
The runner (`scripts/db-migrate.mjs`) applies only `db/migrations/` (518 files). A second dir
`apps/backend/src/migrations/` (10 files) is **orphaned — never applied**. Code references tables/columns whose
CREATE lives ONLY there → guaranteed phantom on every real DB:
```
apps/backend/src/migrations/  (UNAPPLIED):
  0392-auto-deductions.sql            → driver_finance.auto_deduction_policies, payroll.driver_settlement_line_items.auto_deduction_policy_id
  0394-team-splits.sql                → settlements.team_split_configs, settlements.team_split_load_overrides, settlement_lines.split_partner_driver_id
  0395-road-service-tickets.sql       → maintenance.road_service_tickets
  202606080242-maintenance-parts-catalog.sql → mdata.maintenance_parts
  0393-settlement-disputes.sql, 0396-archive-test-users.sql, 0403-onboarding-state.sql,
  202606080241-payroll-integration-cache.sql, 202606080243-maintenance-services-catalog.sql,
  202606080244-usmca-activation-state.sql   (some already duplicated into db/migrations; confirm each)
```
**FIX:** move each orphaned migration into `db/migrations/` (renumber above current max, idempotent,
fresh-DB-safe), OR delete the dead code that references them. These are financial/driver-finance → Tier-1
ceremony, build-and-HOLD, JORGE-APPROVED. **Add a CI guard that fails if `apps/backend/src/migrations/` is
non-empty** (one canonical migrations dir).

## Root cause #2 — phantom COLUMN names (table real, wrong column) — incl. the GL posting path
| File | Write | Phantom column → likely real |
|---|---|---|
| accounting/bank-recon/match.service.ts | INSERT journal_entries | `reference_no`, `created_by` (→ entry_date/memo/created_by_user_id?) |
| accounting/bank-recon/match.service.ts | INSERT journal_entry_postings | `journal_entry_id`→`journal_entry_uuid`, `side`→`debit_or_credit`, `memo`→`description` |
| accounting/recurring.worker.ts, maintenance/two-section-service.ts | INSERT accounting.expenses | `total_amount`→`total_amount_cents`, `linked_work_order_uuid` |
| maintenance/vehicles.routes.ts | INSERT mdata.units | `mileage`→`odometer_mi` |
| routes/safety/hos-violations.ts | INSERT safety.hos_violations | `unit_id`,`violation_code`,`violation_description`,`duty_status`,`severity` |
| routes/safety/dot-inspections.ts | INSERT safety.csa_scores | `score_date`,`total_points`,`source_dot_inspection_count` |
| safety/safety.routes.ts | UPDATE safety.accident_reports | SET `status`,`updated_at` |
| banking/banking.routes.ts | UPDATE banking.bank_accounts | SET `visible`,`tag`,`is_dip` (likely a tile/prefs table, not bank_accounts) |
| cash-advances/cash-advances.routes.ts | UPDATE banking.bank_transactions | SET `advance_id` |
| alerts/alert.routes.ts | INSERT alerts.profile | `created_by_user_id` |
**FIX:** repoint each to the real column (per the migrated schema). Financial ones → ceremony.

## Root cause #3 — phantom TABLES (not orphaned-migration)
- `accounting.journal_entry_lines` — `banking/manual-je.routes.deprecated.ts` (DEAD/deprecated → archive).
- `audit.audit_log` — does NOT exist; real table is **`audit.audit_events`** (owner/todays-attention, ifta/quarterly-preparer).
- `accounting.factoring_companies` — factoring.routes (confirm real name).
- `fuel.loves_prices_daily` — loves-upload + loves-card-import (confirm migration exists).

## The permanent gate (prevention)
- `scripts/verify-sql-write-targets.mjs` + `scripts/sql-write-targets-known-debt.json` (48 entries).
- Runs against the from-migrations DB (DATABASE_URL); wired into `verify:pre-commit` after db-reset.
- **NEW phantom write → CI fails.** Fixing a known-debt item (so it no longer appears) → must remove its
  allowlist line (the gate reports "now FIXED" entries). The allowlist can only shrink to zero.

## Remediation plan (priority order)
1. **#1 structural** — consolidate `apps/backend/src/migrations/` into `db/migrations/` (Tier-1 ceremony) + the empty-dir guard. Clears the auto-deduction/team-split/road-service/maintenance-parts cluster.
2. **#2 GL-posting columns** — fix journal_entries/journal_entry_postings/expenses phantom columns (financial → ceremony; highest risk: corrupts posting).
3. **#3 phantom tables** — repoint audit_log→audit_events; archive deprecated manual-je; confirm factoring/loves tables.
4. Each fix removes its known-debt line; gate stays green + shrinks.
