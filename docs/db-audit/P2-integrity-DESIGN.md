# P2 DB-Audit — Three Integrity/Governance Fixes — DESIGN (BUILD-AND-HOLD)

**Status: DESIGN + VERIFICATION ONLY. Migrations #1 and #3 below are written, HELD, and registered in
`.held-migrations.json` with `DO NOT RUN ON PROD` headers — nothing has been run anywhere, including a
Neon branch. Item #2 is DESIGN + an explicit DATA QUESTION only — no migration was written for it (see
§2). This requires Jorge's explicit "OK to merge" per constitution §1.3/§1.4 (schema change / RLS /
grants) before even a branch-test. Per §1.5, no prod DB access happened to produce this doc — every claim
below is grounded in `db/migrations/` + `apps/backend/src` (read-only), with prod-only questions called
out explicitly as questions, not assertions.**

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

## 2. `driver_finance.escrow_ledger` FK into `settlement.settlement` — DESIGN + DATA QUESTION ONLY (no migration written)

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

### Why this is genuinely unresolved from migrations + code alone — the live-code picture contradicts the stale memory

Auto-memory `schema-canonicalization-verdicts` (6 days old, flagged stale by the memory system itself)
asserts: *"settlement headers = `driver_finance` canonical... Deprecate-not-drop `settlement.*` (0 rows,
dead)."* That claim was GUARD-verified against `pg_stat_user_tables` on 2026-06-28. Re-verifying against
the **current** live codebase (not the 6-day-old snapshot) surfaces a real contradiction:

| File | Registered/mounted in `apps/backend/src/index.ts`? | What it does with `settlement.settlement*` |
|---|---|---|
| `apps/backend/src/settlements/pre-settlements.routes.ts` | **YES** — `index.ts:124,820` (`registerC1PreSettlementsRoutes`) | **READ-ONLY.** 3 `SELECT`s against `settlement.settlement` / `settlement.settlement_line` / `settlement.settlement_deduction` (`GET /api/v1/settlements`, `GET /api/v1/settlements/:id`, `GET /api/v1/settlements/pending-deductions`). No `INSERT`. |
| `apps/backend/src/settlements/approval.routes.ts` + `approval.service.ts` | **NO** — not imported anywhere in `index.ts` (confirmed: only `settlements/pre-settlements.routes.ts` and `settlements/disputes/disputes.routes.ts` are registered from that directory) | This is the **only** code in the entire backend that `INSERT`s into `driver_finance.escrow_ledger` (line 369, with `settlement_id`/`settlement_line_id` sourced from `settlement.settlement_line` reads at lines 62-134/207/244-314) — but it is dead/unreachable HTTP-wise (the "merged-not-live" landmine pattern). |
| Full-repo grep | — | **No `INSERT INTO settlement.settlement`, `settlement.settlement_line`, or `settlement.settlement_deduction` exists anywhere in `apps/backend/src`.** |

So: there is a **live, mounted READ path** into `settlement.settlement*` (pre-settlements list/detail
screens), but **no live WRITE path** anywhere in the current codebase — the only inserter
(`approval.service.ts`) is unreachable. This means:

- Going forward, no *new* rows can be created via the app today.
- It does **not** tell us whether rows already exist from an earlier period when `approval.routes.ts` may
  have been mounted, from manual/seed SQL, or from any other historical write path no longer in the repo.
- The mounted read-only UI (`pre-settlements.routes.ts`) would silently show **stale/frozen data forever**
  if any rows exist, since nothing can update them — itself a separate, smaller correctness concern worth
  a follow-up, but not this block's scope.

### THE DATA QUESTION (needs a live prod read — gated, §1.5, ask Jorge / run under his supervision)

```sql
-- 1. Does settlement.settlement actually have 0 rows today (re-verify the 6-day-old claim)?
SELECT count(*) FROM settlement.settlement;
SELECT count(*) FROM settlement.settlement_line;
SELECT count(*) FROM settlement.settlement_deduction;

-- 2. Does driver_finance.escrow_ledger have any rows with settlement_id/settlement_line_id populated,
--    and if so, do they still resolve to real rows in settlement.settlement(_line)? (orphan check)
SELECT count(*) FILTER (WHERE settlement_id IS NOT NULL) AS with_settlement_id,
       count(*) FILTER (WHERE settlement_line_id IS NOT NULL) AS with_settlement_line_id
FROM driver_finance.escrow_ledger;

SELECT el.id, el.settlement_id, el.settlement_line_id
FROM driver_finance.escrow_ledger el
LEFT JOIN settlement.settlement s ON s.id = el.settlement_id
WHERE el.settlement_id IS NOT NULL AND s.id IS NULL;  -- orphans, should be empty if FK held
```

### Design of the untangle (do NOT execute until Q1/Q2 above are answered)

- **If `settlement.settlement*` truly has 0 rows AND `escrow_ledger` has 0 rows with `settlement_id`/
  `settlement_line_id` populated:** the fix is a clean, low-risk FK repoint — drop the two FKs on
  `driver_finance.escrow_ledger`, add new ones to `driver_finance.driver_settlements(id)` and
  `driver_finance.settlement_lines(id)`. Column types are compatible (`uuid` → `uuid`). This is the
  expected/likely case given no live write path exists, but must be **confirmed, not assumed** — that is
  exactly the "never guess" hardline rule.
- **If `escrow_ledger` has existing rows pointing at real `settlement.settlement(_line)` rows:** the data
  must be migrated/mapped to the equivalent `driver_finance.driver_settlements`/`settlement_lines` rows
  **before** the FK can be repointed — a straight FK swap would either orphan those rows (if nullable) or
  hard-fail the migration (if not). This needs its own migration + a mapping strategy (by
  driver_id + pay_period, most likely) design pass, which is out of scope until Q1/Q2 confirm this branch
  applies.
- **Regardless of the data answer, a second and equally real problem must be fixed alongside the FK
  repoint:** `settlements/pre-settlements.routes.ts` (the live, mounted read UI) also needs to be
  repointed from `settlement.settlement*` to `driver_finance.driver_settlements` / `settlement_lines` —
  otherwise the FK repoint on `escrow_ledger` alone leaves the mounted UI reading a table nothing can ever
  write to. This is a real code change (query rewrite in a live route file), not just a migration, so it
  belongs in the SAME follow-up block as the FK repoint, not silently split off.
- **`settlements/approval.routes.ts` + `approval.service.ts` disposition:** since it's dead/unmounted and
  already targets the wrong (legacy) schema, it should either be (a) deleted (if genuinely superseded —
  needs Jorge's call per the additive-only/archive-don't-delete product lock, §7) or (b) rewired to the
  canonical `driver_finance.*` tables and re-mounted, if the approval workflow it implements
  (line-item approve/reject before settlement finalization) is still wanted. This is a product decision,
  not a schema one — flagging it, not deciding it.

**No migration was written for item 2**, per the task's explicit instruction: deliver the data-question
when unsure, not a blind FK-swap. This is exactly that case.

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

### Adjacent finding — flagged, NOT fixed (out of scope for this block)

Searching the full migration chain for `ALTER TABLE maintenance.work_orders ... ROW LEVEL SECURITY` also
returns **nothing** — the `work_orders` **parent** table itself appears to have no RLS/FORCE RLS ever
applied in the migration history either. This migration's child-table policies do not depend on the
parent having RLS (the subquery filters explicitly on `operating_company_id` regardless of whether RLS is
enabled on the parent table), so the fix above is correct and complete for the two named tables. But
`maintenance.work_orders` itself lacking RLS is a larger, separate finding of the same class (and
arguably higher-severity, since it's the header table) — it needs its own follow-up block, and is
surfaced here rather than silently folded into this one or silently left undiscovered.

---

## Summary

| # | Item | Verdict | Migration | CI Guard |
|---|---|---|---|---|
| 1 | `safety.civil_fines` missing `voided_at` | CONFIRMED | `202607090100_civil_fines_voidable.sql` (HELD) | `verify-civil-fines-voidable.mjs` |
| 2 | `escrow_ledger` FK → `settlement.settlement` | CONFIRMED FK exists; data state UNKNOWN (needs live prod read) | **none written — design + data-question only** | n/a |
| 3 | `work_order_lines` + `wo_status_history` no RLS | CONFIRMED | `202607090200_maintenance_wo_lines_status_history_rls.sql` (HELD) | `verify-maintenance-wo-lines-status-history-rls.mjs` |

Both migrations are registered in `db/migrations/.held-migrations.json` and carry `DO NOT MERGE-AND-RUN /
DO NOT RUN ON PROD` headers. Item 2's data question is the blocking prerequisite for any future migration
there — surfaced explicitly for Jorge, not guessed.
