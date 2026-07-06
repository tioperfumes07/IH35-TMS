# P2 DB-Audit — Three Integrity/Governance Fixes — DESIGN (BUILD-AND-HOLD)

**Status: DESIGN + VERIFICATION ONLY. All THREE migrations below are written, HELD, and registered in
`.held-migrations.json` with `DO NOT RUN ON PROD` headers — nothing has been run anywhere, including a
Neon branch. This requires Jorge's explicit "OK to merge" per constitution §1.3/§1.4 (schema change / RLS
/ grants) before even a branch-test. Per §1.5, this agent performed no prod DB access — the read-only
prod data-audit that unblocked Item 2 (row counts on `settlement.settlement` / `driver_finance.escrow_ledger`)
was run by the coordinator under Jorge's supervision and reported back; it is cited as a reported result,
not something this agent executed. All other claims are grounded in `db/migrations/` + `apps/backend/src`
(read-only).**

**UPDATE (2026-07-05, after the coordinator's prod data-audit):** Item 2's data question came back
conclusive — both tables are EMPTY (0 rows), so migration #3 was written (schema-only FK repoint, no data
to move). Item 3's "work_orders parent has no RLS" flag was a FALSE POSITIVE — `maintenance.work_orders`
already has FORCE RLS; that concern is retracted below.

Branch: `design/p2-integrity-fixes` (isolated worktree, off `origin/main`).

---

## 1. `safety.civil_fines` missing `voided_at` — CONFIRMED, FIXED (migration written, HELD)

### Verification

- `safety.civil_fines` is the canonical name (per memory `two-fines-tables-civil-vs-internal`) for what
  was originally created as `safety.fines` by `db/migrations/0050_safety_gaps_fill.sql:17-41`, then
  renamed by a guarded `ALTER TABLE safety.fines RENAME TO civil_fines` in
  `0050_two_section_v5_and_safety_restructure.sql:222-227`, with the rename actually completed (prod
  apply-order collision) by the repair migration
  `202606151200_repair_safety_0050_ordering_collision.sql`.
- Its original `CREATE TABLE` (`0050_safety_gaps_fill.sql:17-41`) has:
  - `status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','contested','dismissed','reduced'))`
    — **no `'voided'` member.**
  - Only a generic soft-archive `deactivated_at timestamptz NULL` — **no `voided_at` / `voided_reason`
    columns anywhere.**
  - Grep of the entire `db/migrations/` tree for `ALTER TABLE safety.civil_fines` / `ALTER TABLE
    safety.fines` confirms no later migration ever added void columns either.
- Sibling table `safety.internal_fines` (created in the same file, `0050_two_section_v5_and_safety_restructure.sql:260-275`)
  has the correct shape:
  ```sql
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'disputed', 'converted_to_liability', 'voided'
  )),
  ...
  voided_at timestamptz,
  voided_reason text
  ```
  Note it does **NOT** have a `voided_by_user_id` column — the task's "match its shape" instruction
  means voided_at + voided_reason only, which is exactly what this migration adds.
- The live void pattern this unlocks is already proven out for `internal_fines` in
  `0069_p3_t11_20_test_data_cleanup.sql:102-120`: `UPDATE ... SET status='voided', voided_at=..., voided_reason=...`.
  `civil_fines` cannot do this today — a wrongly-entered civil (external/regulatory: customs/police/DOT)
  fine can only be `UPDATE`d in place or hard-`DELETE`d. **This is a real void-not-delete violation**,
  confirmed, not a false alarm.
- Compounding factor: `ih35_app` currently **can** `DELETE` `safety.civil_fines` rows. `0050_safety_gaps_fill.sql:257`
  only grants `SELECT, INSERT, UPDATE` on `safety.fines` — but
  `db/migrations/0065_p3_cleanup_3_permanent_grants.sql:40-54` runs a blanket, schema-wide
  `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA safety TO ih35_app`, which retroactively
  re-grants `DELETE` on every table in `safety.*` including `civil_fines`. So the app has both the
  motive (no void path) and the means (DELETE grant) to destroy evidence of a civil fine — the worst
  combination for a legal/compliance evidence table.

### Fix (migration `db/migrations/202607090100_civil_fines_voidable.sql`, HELD)

Additive, idempotent, no data touched:

1. `ADD COLUMN IF NOT EXISTS voided_at timestamptz NULL` / `voided_reason text NULL` — exact shape of
   `internal_fines`.
2. Widen the `status` CHECK constraint to allow `'voided'`. The constraint's real name is unknown from
   the migration source (auto-generated at `CREATE TABLE safety.fines` time as something like
   `fines_status_check`; `ALTER TABLE ... RENAME TO civil_fines` never renames constraints, so hard-coding
   a guessed name would be fragile/wrong). The migration instead **discovers the constraint dynamically**
   via `pg_constraint` + `pg_get_constraintdef()` (matching on `status...IN` and NOT already containing
   `'voided'`), drops it, and adds a new named constraint `chk_civil_fines_status_voidable` — safe to
   re-run, safe if the constraint was already fixed by hand.
3. `REVOKE DELETE ON safety.civil_fines FROM ih35_app` — closes the DELETE gap that `0065`'s schema-wide
   default grant opened. This is the exact precedent already shipped for `accounting.expenses`
   (`202606151300_expenses_header_phase1_foundation.sql`, locked by
   `scripts/verify-expenses-cents-and-void-not-delete.mjs`).
4. A supporting partial index `ix_civil_fines_active ON safety.civil_fines (operating_company_id) WHERE
   voided_at IS NULL` for the common "active fines" read path.

### CI guard (new, ships with this PR)

`scripts/verify-civil-fines-voidable.mjs` (wired into `verify:arch-design`) statically asserts the held
migration file: adds both void columns, widens the CHECK to include `'voided'`, `REVOKE`s `DELETE` on
`safety.civil_fines` from `ih35_app`, and never re-`GRANT`s it — so none of these four decisions can
silently regress in a future edit.

**Application-layer note (out of scope for this migration, flag for a follow-up block):** once this
schema fix lands, the Safety UI / civil-fines routes need an actual "Void" action wired to it (currently
there is none — only edit/delete). Building that UI/route is a separate block; this migration only makes
voiding *possible* at the schema layer.

---

## 2. `driver_finance.escrow_ledger` FK into `settlement.settlement` — CONFIRMED, DATA-AUDIT ANSWERED, migration written (HELD)

### Verification — the FK is real

`driver_finance.escrow_ledger` (`db/migrations/202606120600_d1_settlement_approval.sql:139-156`):

```sql
CREATE TABLE IF NOT EXISTS driver_finance.escrow_ledger (
  ...
  settlement_id UUID REFERENCES settlement.settlement(id),
  settlement_line_id UUID REFERENCES settlement.settlement_line(id),
  ...
);
```

Confirmed: both FKs point into the `settlement.*` family, not the canonical `driver_finance.driver_settlements`
(`0124_p6_active_drift_reconciliation.sql:68-98`) + `driver_finance.settlement_lines`
(`0191_driver_finance_settlement_lines.sql:6-24`) tables.

### Canonical target confirmed

Canonical settlement tables (per `schema-canonicalization-verdicts` memory: *"settlement headers =
`driver_finance` canonical"*):
- `driver_finance.driver_settlements` — `0124_p6_active_drift_reconciliation.sql:68-69` — PK `id uuid`.
- `driver_finance.settlement_lines` — `0191_driver_finance_settlement_lines.sql:6-7` — PK `id uuid`
  (already itself FKs `settlement_id → driver_finance.driver_settlements(id)`).

Both PKs are `uuid PRIMARY KEY` — type-compatible with `escrow_ledger`'s `uuid` `settlement_id` /
`settlement_line_id` columns. No backend code references either canonical table from the escrow/settlement
services, so there's no conflicting signal about which is canonical — the memory + migration evidence agree.

### Live prod data-audit (read-only; run by the coordinator under Jorge's supervision, §1.5 — reported, not run by this agent)

**2026-07-05 result:**
- `settlement.settlement` = **0 rows**.
- `driver_finance.escrow_ledger` = **0 rows**.
- **0** escrow rows carry a `settlement_id`.

→ Both tables are EMPTY. The untangle is **schema-only, no data to move, low risk**. A straight DROP-then-ADD
FK is safe (nothing to orphan, nothing to fail a check against).

### Fix (migration `db/migrations/202607090300_escrow_ledger_repoint_fk_to_canonical.sql`, HELD)

Idempotent, no data touched (both tables empty):
1. Discover the existing FK constraint(s) on `driver_finance.escrow_ledger` that reference
   `settlement.settlement` / `settlement.settlement_line` via `pg_constraint` (NOT by a guessed name — the
   inline `REFERENCES` FKs were auto-named at `CREATE` time). Drop each if present.
2. Add named FKs to the canonical targets: `fk_escrow_ledger_settlement` (`settlement_id →
   driver_finance.driver_settlements(id)`) and `fk_escrow_ledger_settlement_line` (`settlement_line_id →
   driver_finance.settlement_lines(id)`). Each ADD is skipped if a FK to the canonical target already
   exists — fully re-runnable.

CI guard `scripts/verify-escrow-ledger-fk-canonical.mjs` (wired into `verify:arch-design`) statically
asserts the migration repoints to both canonical targets and dynamically drops the retired
`settlement.settlement` FKs first.

### Flagged, NOT fixed here (same follow-up block as the retired-`settlement.*` disposition)

The mounted read path `apps/backend/src/settlements/pre-settlements.routes.ts` (registered
`index.ts:124,820`) still `SELECT`s from `settlement.settlement` / `settlement.settlement_line` /
`settlement.settlement_deduction`. It reads **0 rows today** (the tables are empty), so it is not
user-visible-broken — but it should be repointed to `driver_finance.driver_settlements` /
`settlement_lines` in the SAME follow-up that dispositions the retired `settlement.*` family. That is a
route/code change (query rewrite in a live file), out of scope for this schema migration. Separately, the
only code that ever inserted into `escrow_ledger` (`settlements/approval.service.ts`) is unmounted/dead
and targets the legacy schema — its disposition (delete-vs-rewire-and-remount) is a product decision for
Jorge (§7 archive-don't-delete), flagged not decided.

---

## 3. `maintenance.work_order_lines` + `maintenance.wo_status_history` — NO RLS — CONFIRMED, FIXED (migration written, HELD)

### Verification

- `maintenance.work_order_lines`: created by `0050_two_section_v5_and_safety_restructure.sql:118-126`
  (`CREATE TABLE IF NOT EXISTS maintenance.work_order_lines (...)`), columns extended by the same
  migration (`section`/`parent_line_uuid`/etc, lines 131-152) and re-applied by the repair migration
  `0198_repair_work_order_lines_two_section_columns.sql` (production recorded `0050` as applied but the
  columns were never actually applied). Has an audit trigger
  (`0276_audit_triggers.sql:137: SELECT audit.ensure_row_trigger('maintenance', 'work_order_lines')`) but
  **no RLS anywhere** — exhaustive grep of `db/migrations/*.sql` for `ALTER TABLE
  maintenance.work_order_lines ... ROW LEVEL SECURITY` or any `CREATE POLICY ... ON
  maintenance.work_order_lines` returns nothing.
- `maintenance.wo_status_history`: created by `0190_maintenance_wo_status_history.sql:6-19` as an
  explicit self-heal ("referenced by REST routes but was never introduced in the SQL migration chain
  (runtime INSERT failed on fresh PG replays)"). Same exhaustive grep: **no RLS anywhere** for this table
  either.
- Both are genuine company-data tables (work-order line items and status-change audit trail) reachable
  with zero tenant boundary today — any `ih35_app` session can read/write **any** company's rows,
  cross-tenant and cross-entity (TRANSP/TRK/USMCA). This is exactly the class of gap the
  `cross-entity-leak-audit-usmca` memory flags as a USMCA-launch blocker.
- Neither table carries its own `operating_company_id` column — `work_order_lines` only has
  `work_order_uuid uuid NOT NULL` (no formal FK constraint to `work_orders` found either — a smaller,
  separate gap, noted but not fixed here to stay in scope); `wo_status_history` has a real FK:
  `work_order_id uuid NOT NULL REFERENCES maintenance.work_orders(id) ON DELETE CASCADE`.
- Precedent for the fix shape: `accounting.bill_lines` — also a child table with no
  `operating_company_id` of its own — is isolated **through its parent**
  (`202606080040_enable_rls_bill_lines_expense_lines_line_category_load_required.sql:44-63`):
  ```sql
  CREATE POLICY bill_lines_company_isolation ON accounting.bill_lines
    FOR ALL TO ih35_app
    USING (
      identity.is_lucia_bypass()
      OR bill_id IN (
        SELECT b.id FROM accounting.bills b
        WHERE b.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
      )
    ) WITH CHECK (...)
  ```
  `maintenance.work_orders` (the parent) has `operating_company_id` confirmed present
  (`0049_p3_t11_6_1_wo_format_vendor_inventory_integrity.sql:10-24`).

### Fix (migration `db/migrations/202607090200_maintenance_wo_lines_status_history_rls.sql`, HELD)

`ENABLE` + `FORCE` `ROW LEVEL SECURITY` on both tables, with one isolate-through-parent policy each,
identical shape to the `bill_lines` precedent (lucia-bypass included): `work_order_lines` joins on
`work_order_uuid = work_orders.id`; `wo_status_history` joins on `work_order_id = work_orders.id`.
Defensive `GRANT`s (belt-and-suspenders; `0065` already covers these tables).

### CI guard (new, ships with this PR)

`scripts/verify-maintenance-wo-lines-status-history-rls.mjs` (wired into `verify:arch-design`) statically
asserts: both tables get `ENABLE` **and** `FORCE` RLS, both get a named isolate-through-parent policy, the
`identity.is_lucia_bypass()` escape hatch is present, and both policies actually reference
`maintenance.work_orders` — so this can't silently regress.

### Adjacent finding — RETRACTED (was a false positive)

An earlier draft of this doc flagged that `maintenance.work_orders` (the parent) itself appeared to have
no RLS, based on a migration-source grep finding no `ALTER TABLE maintenance.work_orders ... ROW LEVEL
SECURITY`. **The coordinator's live prod check (2026-07-05) confirms this was a FALSE POSITIVE:
`maintenance.work_orders` ALREADY has FORCE RLS on `operating_company_id`** (the RLS was applied by a path
the source-grep pattern missed — e.g. a dynamic/loop-based enablement). No action is needed on
`work_orders` itself. Only the two child tables (`work_order_lines`, `wo_status_history`) genuinely lacked
RLS, and those are fixed by migration `202607090200`. This also independently confirms the child-table
policies' parent join is sound (the parent is RLS-protected and scoped on the same column).

---

## Summary

| # | Item | Verdict | Migration | CI Guard |
|---|---|---|---|---|
| 1 | `safety.civil_fines` missing `voided_at` | CONFIRMED | `202607090100_civil_fines_voidable.sql` (HELD) | `verify-civil-fines-voidable.mjs` |
| 2 | `escrow_ledger` FK → `settlement.settlement` | CONFIRMED FK; prod data-audit: both tables 0 rows → schema-only repoint | `202607090300_escrow_ledger_repoint_fk_to_canonical.sql` (HELD) | `verify-escrow-ledger-fk-canonical.mjs` |
| 3 | `work_order_lines` + `wo_status_history` no RLS | CONFIRMED (parent `work_orders` already RLS'd — false-positive retracted) | `202607090200_maintenance_wo_lines_status_history_rls.sql` (HELD) | `verify-maintenance-wo-lines-status-history-rls.mjs` |

All three migrations are registered in `db/migrations/.held-migrations.json` and carry `DO NOT
MERGE-AND-RUN / DO NOT RUN ON PROD` headers — none has been run anywhere, including a Neon branch. Two
follow-ups flagged (not done here): repoint `settlements/pre-settlements.routes.ts` reads to the canonical
`driver_finance` tables + disposition the retired `settlement.*` family and the dead
`settlements/approval.*` code.
