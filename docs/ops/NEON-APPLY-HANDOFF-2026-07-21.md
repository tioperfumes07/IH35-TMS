# NEON-APPLY HANDOFF — 2026-07-21 (evening restatement)

**Audience:** Jorge (owner) applying Neon DDL by hand — or an owner-gated agent acting only on Jorge's explicit apply order.
**Prod branch:** `br-fancy-credit-akjnd07a`.
**Ledger:** `ih35_migrations.applied_migrations`.

**Session fact (2026-07-21 evening):** Claude / Cursor did **NOT** apply any Neon DDL this session. All Neon work was **reads only**. Owner hand applies.

Prior object-absence / ledger-MISSING facts for the three held migrations were verified live earlier on 2026-07-21 with
`SELECT set_config('app.bypass_rls','lucia',true)` in the same transaction (FORCED-RLS false-empty rule).

---

## Still unapplied (ledger MISSING; objects absent as previously verified)

| Step | Migration | Status on Neon |
|---|---|---|
| 1 | `202607370000_driver_payment_methods.sql` | **UNAPPLIED** — ledger MISSING; `driver_finance.driver_payment_methods` absent |
| 2 | `202607380000_settlement_payrun_catalog_and_extends.sql` | **UNAPPLIED** — ledger MISSING; pay-run extends not applied |
| 3 | `202607400000_units_vin_no_synthetic_dup.sql` | **UNAPPLIED** — ledger MISSING; VIN CHECK absent |
| 4 | `202607670000_settlement_coa_roles_widen_check.sql` | **UNAPPLIED on Neon** — file is on `main` via #3109 squash `d8370fe839`; Neon still needs owner apply |

## Apply order (strict)

```
370000 → 380000 → 400000 → 202607670000
```

**Why order matters:** `202607380000` (around line 105) adds an FK onto
`driver_finance.driver_payment_methods`, which **only** `202607370000` creates. Applying 380000 before
370000 **fails**.

---

## Hard laws for this handoff

1. **Ledger row ONLY after DDL actually executes.** Insert into `ih35_migrations.applied_migrations`
   only after the migration SQL has successfully run on Neon. **NEVER** "ledger-backfill without apply."
2. **`catalogs.payment_methods` already on prod is NOT evidence that 380000 ran.** That table comes from
   older migration **0152**. Migration **380000 REUSE-AND-EXTENDs** it. Presence of the catalog table is
   **not** proof 380000 applied and is **not** a reason to skip 380000.
3. **BLOCKER before applying 380000:** the `settlement_lines.line_type` CHECK in §5 of
   `202607380000_settlement_payrun_catalog_and_extends.sql` must be fixed as a **true live-superset** of
   every `line_type` value already accepted on prod (companion HOLD PR that fixes the migration file on
   `main`). **Do not apply 380000 until that fix is on main.** Applying a non-superset DROP+ADD CHECK
   would reject existing live line types.
4. **After 670000:** owner designates the **9 settlement roles** on the CoA Roles page into
   `accounting.chart_of_accounts_roles` (**PRIMARY**). Do **NOT** seed `catalogs.account_role_bindings`.
   **#3109 KEEP.** No competing legacy Zod / CHECK-only widen that re-centers the legacy bindings table.
5. **CoA-roles routes:** **ALREADY_MOUNTED** via autoload (`coa-roles.routes.ts` `export default fp`);
   #3102 closed as double-mount risk; #3104 guard on main. Designation UI path is live once the roles
   CHECK is widened on Neon (step 4).

---

## Per-migration notes

### 1. `db/migrations/202607370000_driver_payment_methods.sql`

- Creates canonical `driver_finance.driver_payment_methods` (tokenized bank ref + last4 only; FORCED RLS;
  void-not-delete).
- Previously verified: `to_regclass('driver_finance.driver_payment_methods')` → `NULL`; not in ledger.
- **Action:** apply → ledger → re-verify `to_regclass(...)` non-NULL.

### 2. `db/migrations/202607380000_settlement_payrun_catalog_and_extends.sql`

- REUSE-AND-EXTEND of `catalogs.payment_methods` (from **0152**), FK from
  `driver_finance.driver_payment_methods.payment_method_id`, advance/escrow line-type + role-key widens,
  `driver_finance.payrun_gl_runs` idempotency anchor. No GL/posting math.
- **BLOCKED** until companion live-superset fix for §5 `line_type` CHECK is on `main`.
- Ordered strictly **after** 370000 (FK dependency).
- **Action (only after blocker cleared):** apply idempotently → ledger → re-verify effects
  (columns / constraints / `payrun_gl_runs`).

### 3. `db/migrations/202607400000_units_vin_no_synthetic_dup.sql`

- Adds CHECK `units_vin_no_synthetic_dup_suffix` on `mdata.units` / `master_data.units` blocking
  synthetic `-U` VIN suffix on ACTIVE units.
- Previously verified: no such CHECK on prod.
- **Pre-apply:** confirm no ACTIVE unit VIN ends in `-U` so `ADD CONSTRAINT` validates.
- **Action:** apply → ledger → re-verify via `pg_constraint`.

### 4. `db/migrations/202607670000_settlement_coa_roles_widen_check.sql`

- From **PR #3109** (JORGE-APPROVED; merged to main as squash `d8370fe8398ba100813ed0006c4330142d153213`).
- Widens `accounting.chart_of_accounts_roles` role CHECK for the 9 settlement designations.
- **Neon still needs owner apply** after steps 1–3.
- **After apply:** owner designates the 9 settlement roles on CoA Roles UI →
  `accounting.chart_of_accounts_roles` only. Do not seed `catalogs.account_role_bindings`.

---

## Procedure (repo law — per migration, in order)

1. **Throwaway validation first:** apply each migration on throwaway Postgres **twice** (apply-twice /
   idempotency) before touching Neon.
2. **Apply on Neon prod** (`br-fancy-credit-akjnd07a`) by owner's hand.
3. **Ledger the apply:** insert `(name, applied_at, applied_by)` into
   `ih35_migrations.applied_migrations` **only after** DDL succeeded.
4. **Re-verify the EFFECT, not just the ledger:** `to_regclass(...)` / `pg_constraint` / column presence,
   with RLS bypass GUC in the same transaction when row-counts are involved. A ledgered-but-ineffective
   migration is a defect.

---

## Post-670000 operator checklist

- [ ] 370000 / 380000 / 400000 / 670000 each: DDL ran + ledger row + effect re-verified
- [ ] 380000 applied only after live-superset §5 fix was on `main`
- [ ] Nine settlement roles designated on CoA Roles page → `accounting.chart_of_accounts_roles`
- [ ] No rows seeded into `catalogs.account_role_bindings` for this path
- [ ] CoA Roles UI reachable (autoload mount + #3104 guard already on main)
