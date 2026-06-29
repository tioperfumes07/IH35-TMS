# Migration Drift — Forensic Findings (read-only)

**Tool:** `scripts/audit-migration-drift.mjs` (read-only; requires explicit `--database-url`; never
auto-connects via `.env`, §1.5). Parses `db/migrations/*.sql` for declared `CREATE TABLE`,
`ADD COLUMN`, `ADD CONSTRAINT` (FK/UNIQUE/CHECK/PK), and `CREATE INDEX`, **nets out** later
`DROP`/recreate, then reports each declared object as PRESENT or MISSING against the live schema.
**Reports only — never auto-fixes.** Each MISSING finding is a candidate repair block for GUARD/Jorge.

**Motivation:** #1612 proved a migration-immutability breach — `0061` declares
`fk_invoices_factoring_advance` that prod never received and no later migration drops. This scan
finds siblings.

---

## A. Fresh-migrated DB baseline (2026-06-28)

Run against a clean fresh-migrated local DB (all 531 migrations applied, local socket). On a clean
apply, declared==applied EXCEPT for objects whose **source DDL targets a phantom/renamed table** —
those are declared but never materialize. This baseline (18 entries) is the tool's expected floor;
**any PROD finding beyond this set is real prod drift.**

```
declared: 500 tables, 1008 columns, 119 constraints, 1019 indexes
declared-but-MISSING on fresh DB: 18
```

| Finding | Source | Triage |
|---|---|---|
| `dispatch.loads.cancel_reason`, `.cancel_reason_code`, `.canceled_at`, `.canceled_by` + check `dispatch_loads_cancel_reason_code_check` | `0281_dispatch_cancel_reason.sql` | **PHANTOM** — `dispatch.loads` does not exist (real = `mdata.loads`, §4). The migration's adds are guarded/no-op on a real apply. Pre-existing; see CODER-23. Not new drift. |
| `driver_pay.settlements.payment_*` (7 cols) | `0088_p5_t5_settlement_payment_state.sql` | **PHANTOM** — `driver_pay.settlements` does not exist (real = `driver_finance.driver_settlements` / `settlement_lines`). Guarded/no-op. Not new drift. |
| `safety.fines` (table) + FK `fk_safety_fines_converted_liability` | `0050_safety_gaps_fill.sql` | **RENAMED** — `safety.fines` → `safety.civil_fines` (+ `safety.internal_fines`); the rename isn't netted by name. Not missing data. |
| `banking.bank_transactions.bank_transactions_matched_bill_id_fkey`, `…_matched_settlement_id_fkey` | `0073_p5_t1_1_banking_bank_transactions.sql` | **INVESTIGATE** — declared FKs absent on fresh DB. Likely recreated/renamed later or created inline under a different name; GUARD to confirm benign vs real. |
| `maint.idx_maint_work_order_driver_status` (index) | `0282_driver_repair_link.sql` | **INVESTIGATE** — `maint` is a deprecated schema twin of `maintenance`; index likely lives under `maintenance`. GUARD to confirm. |

**Verdict:** the baseline is consistent with the CODER-23 reconcile — phantom/renamed parser artifacts,
plus two INVESTIGATE items (banking FKs, maint index) for GUARD to classify. No new fresh-DB drift.

## B. PROD run — PENDING (§1.5)

The high-value run is against **prod** (read-only) to find drift like `fk_invoices_factoring_advance`
(#1612) that is present on a fresh DB but absent on prod. Per §1.5 I do not connect to prod
unprompted. **To produce the prod MISSING list, run (Jorge/GUARD, with explicit prod url):**

```bash
node scripts/audit-migration-drift.mjs --database-url="<prod>" --out docs/audits/migration-drift-prod.txt
```

Real prod drift = entries in the prod output that are **not** in the §A baseline above. The companion
guard `verify-migration-application-consistency` (now prod-safe via #1611) independently confirms
tables/indexes/FKs and already flagged `fk_invoices_factoring_advance` against prod.
