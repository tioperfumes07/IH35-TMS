# NEON-APPLY HANDOFF — 2026-07-21 (3 remaining held migrations)

**Audience:** owner's Claude agent performing the Neon prod apply (Jorge's hand / owner-gated).
**Prod branch:** `br-fancy-credit-akjnd07a`.
**Ledger:** `ih35_migrations.applied_migrations`.

All facts below were verified LIVE on the Neon prod branch on **2026-07-21**, with
`SELECT set_config('app.bypass_rls','lucia',true)` in the same transaction (FORCED-RLS false-empty rule),
against the ledger `ih35_migrations.applied_migrations`.

## STOP — apply gate (read first)

- **Claude / coder applied NOTHING.** Prior sessions were read-only. Do not treat any chat claim of
  “applied / ledgered / done” as evidence — re-verify on Neon.
- **BLOCK Neon-apply of `202607380000` until the line_type SUPERSET fix is on `main`** (PR titled
  `[HOLD-FOR-JORGE] fix(migrations): 202607380000 settlement_lines line_type CHECK must be true
  superset (keep escrow/auto_deduction/dispute_adjustment)`). The pre-fix migration would DROP live
  `escrow` / `auto_deduction` / `dispute_adjustment` from `driver_finance.settlement_lines`.
- **Do NOT ledger-backfill `202607380000` without applying the DDL.** It never ran on prod —
  `to_regclass('driver_finance.payrun_gl_runs')` is `NULL`. Ledger-only would lie.
- **`catalogs.payment_methods` already exists** from older migration `0152`. That is **NOT** evidence
  that `202607380000` ran. The effect marker for 380000 is `driver_finance.payrun_gl_runs` (+ the
  widened line_type CHECK / role_key CHECK).

## Context

- Of the **72 held migrations** registered in `db/migrations/.held-migrations.json`, **69 are already
  applied + ledgered on prod**.
- The owner greenlit ("all 3") applying the **remaining 3** on 2026-07-21 — **subject to the STOP gate
  above** before 380000.
- These migrations are HELD (built-and-held, owner-applied only): `ih35_app` cannot run DDL, and the
  held-migration firewall means prod `db:migrate` skips them — the owner applies by hand on Neon and
  then ledger-backfills **after** the DDL effect is proven.

## Apply order (locked)

1. `202607370000_driver_payment_methods.sql`
2. `202607380000_settlement_payrun_catalog_and_extends.sql` — **only after line_type SUPERSET fix on main**
3. `202607400000_units_vin_no_synthetic_dup.sql`
4. `202607670000_settlement_coa_roles_widen_check.sql` (merged #3109)

## The migrations — detail

### 1. `db/migrations/202607370000_driver_payment_methods.sql`

- **What it creates:** the canonical driver payment-method master-data table
  `driver_finance.driver_payment_methods` (tokenized bank reference + last4 only — never raw
  routing/account numbers; FORCED RLS + 0065 grants; void-not-delete), so the settlement ACH payment
  path reads a real store instead of probing non-existent `mdata.drivers` columns.
- **Verified on prod 2026-07-21:** the table does **NOT** exist —
  `to_regclass('driver_finance.driver_payment_methods')` returned `NULL`. Not in the ledger.
- **Action:** apply, then ledger, then re-verify `to_regclass('driver_finance.driver_payment_methods')`
  is non-NULL.

### 2. `db/migrations/202607380000_settlement_payrun_catalog_and_extends.sql`

- **What it creates:** Settlement Pay-Run infrastructure — extends the existing owner-editable
  `catalogs.payment_methods` catalog, adds the
  `driver_finance.driver_payment_methods.payment_method_id` FK into that catalog, extends
  `driver_finance.driver_advances` / `cash_advance_requests` / `settlement_lines` (TRUE SUPERSET
  line_type CHECK: live 11 + `escrow_contribution` = 12), widens `catalogs.account_role_bindings.role_key`
  CHECK (+ `abandonment_chargeback_recovery` only — no seed), and creates the
  `driver_finance.payrun_gl_runs` idempotency anchor. No GL/posting math.
- **Verified on prod 2026-07-21:**
  - `catalogs.payment_methods` **ALREADY EXISTS** (from `0152`) — **not** proof 380000 ran.
  - `driver_finance.payrun_gl_runs` is **NULL** — 380000 **never ran**.
  - Not in `ih35_migrations.applied_migrations`.
  - Live `settlement_lines` has **two** line_type CHECKs; the fuller set is 11 values including
    `escrow`, `auto_deduction`, `dispute_adjustment`.
- **Action:** after SUPERSET fix is on main → apply **idempotently** (DDL), prove
  `to_regclass('driver_finance.payrun_gl_runs')` non-NULL + line_type CHECK is the 12-value set,
  **then** ledger. Ordered strictly AFTER 202607370000.

### 3. `db/migrations/202607400000_units_vin_no_synthetic_dup.sql`

- **What it creates:** CHECK constraint `units_vin_no_synthetic_dup_suffix` on `mdata.units`
  (aka `master_data.units`) blocking the synthetic `-U` VIN suffix on ACTIVE units — makes the
  2026-07-04 bulk fleet-duplication insert pattern structurally impossible (voided rows + NULL VIN
  exempt).
- **Verified on prod 2026-07-21:** **no CHECK constraints exist** on `master_data.units`.
- **Pre-apply proof (per the migration header):** confirm NO active unit currently has a VIN ending in
  `-U` (all such rows are the voided phantoms) so `ADD CONSTRAINT` validates cleanly.
- **Action:** apply, then ledger, then re-verify via `pg_constraint`
  (`conname = 'units_vin_no_synthetic_dup_suffix'` on `mdata.units`).

### 4. `db/migrations/202607670000_settlement_coa_roles_widen_check.sql`

- From **PR #3109** (JORGE-APPROVED 2026-07-21; **merged to main** as squash
  `d8370fe8398ba100813ed0006c4330142d153213`).
- Apply as step **4** after 370 → 380 → 400. DDL-only CHECK widen (no seed). §2 re-asserts the same
  `account_role_bindings.role_key` list as 380000 §5b so 380→670 never narrows.

## Procedure (repo law — per migration, in order)

1. **Throwaway validation first:** apply each migration on a throwaway Postgres **twice**
   (apply-twice / idempotency proof) before touching Neon.
2. **Apply on Neon prod** (`br-fancy-credit-akjnd07a`) by owner's hand.
3. **Prove the EFFECT** (`to_regclass` / `pg_constraint`) with RLS bypass where row-counts matter.
4. **Only then ledger** the apply into `ih35_migrations.applied_migrations`.
5. A ledgered-but-ineffective migration is a defect. A ledger-without-DDL for 380000 is forbidden.
