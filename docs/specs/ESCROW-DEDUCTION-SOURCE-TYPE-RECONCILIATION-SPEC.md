# SPEC — reconcile `escrow_deductions_pending.source_type` onto the canonical recovery catalog

**Status:** SPEC ONLY — do not build from this without the GUARD gate below.
**Author:** Claude (planning lane), 2026-07-27. **Builder:** Cursor. **Applier:** owner, on Neon.
**Gate:** FINANCIAL CLUSTER. It alters an **applied** CHECK constraint on `driver_finance.*`.
GUARD must sign off before Cursor writes SQL; the owner applies; GUARD re-proves live.

---

## 1. Why

The system currently answers "why is escrow being drawn?" in three incompatible places. Two were
resolved by the owner ruling of 2026-07-27; this spec closes the third — the one that is already
**applied on prod** and therefore the only one that can silently misbehave today.

| where | shape | status |
|---|---|---|
| `catalogs.driver_deduction_types` | `may_draw_escrow`, `default_recovery_rail`, `survives_separation` | CANONICAL (PR #3660, HELD) |
| `catalogs.escrow_types` | `may_draw_escrow` | **rejected** — bucket catalog, cannot express settlement-first |
| `driver_finance.escrow_deductions_pending.source_type` | hardcoded CHECK | **APPLIED on prod — this spec** |

Live on `br-fancy-credit-akjnd07a`, 2026-07-27:

```
escrow_deductions_pending_source_type_check
  CHECK (source_type = ANY (ARRAY['load_abandonment','damage_claim','manual_proposal']))
```

Two problems with it:

1. **It is a hardcoded dialect.** A new recovery reason requires a migration and a deploy, which is
   exactly the drift that put HOS enforcement on 2 of 4 dispatch assignment paths. The owner ruling
   is that recovery policy is DATA.
2. **It has no safety-fine member.** A driver-responsible safety fine — one of the three situations
   the owner named, and the one that most often arrives *after* separation — **cannot currently be
   proposed as an escrow deduction at all.** This is a live functional gap, not a tidiness issue.

## 2. Target state

`source_type` references the canonical catalog by code, entity-safely:

```
FOREIGN KEY (operating_company_id, source_type)
  REFERENCES catalogs.driver_deduction_types (operating_company_id, code)
```

The composite form is required, not stylistic: it guarantees the reason belongs to the **same
operating company** as the deduction. A single-column FK on `code` alone would let a TRANSP
deduction cite a USMCA reason. Verified present and usable:
`driver_deduction_types_operating_company_id_code_key UNIQUE (operating_company_id, code)`.

## 3. Mapping

`source_type` is lower snake case; catalog codes are UPPER-KEBAB. The values must be converted
**before** the CHECK is dropped and the FK added.

| current `source_type` | canonical `code` | note |
|---|---|---|
| `load_abandonment` | `ABANDONMENT` | seeded by #3660, `may_draw_escrow=true`, rail `escrow` |
| `damage_claim` | `DAMAGE` | seeded by #3660, rail `split` |
| `manual_proposal` | `MANUAL` | **new row — see §4** |
| *(absent)* | `SAFETY-FINE` | seeded by #3660, rail `settlement`; closes the gap |

**Row count on prod is 0** (`escrow_deductions_pending`, verified 2026-07-27), so no production data
is at risk. The conversion `UPDATE` must still be written — correctly and idempotently — because CI,
local databases and any future branch may hold rows, and a migration that is only correct on an empty
table is a landmine, not a migration.

## 4. The one open decision — `MANUAL`

`manual_proposal` is the escape hatch for a draw with no coded reason. It must exist as a catalog row
or the FK breaks it, but its policy is a judgement call.

**Recommendation: seed `MANUAL` with `may_draw_escrow = false`, `default_recovery_rail = 'ask'`,
`survives_separation = false`.**

Rationale: an *uncoded* reason should not silently carry authority to draw a driver's escrow. Making
it restrictive by default means an operator who needs a manual escrow draw must either enable the flag
deliberately (an auditable catalog edit) or add a proper coded reason — both better outcomes than a
permanent unnamed hole in the policy. With 0 rows on prod this costs nothing today. **Owner: confirm
or overrule before Cursor seeds it.**

## 5. Order of operations (must not be reordered)

1. **#3660 applied first.** Its columns and its `ABANDONMENT` / `DAMAGE` / `SAFETY-FINE` rows must
   exist, or the FK has nothing to point at.
2. Seed `MANUAL` per §4, per entity, dynamically from `org.companies` — no hardcoded UUIDs.
3. `UPDATE` existing `source_type` values to canonical codes (idempotent — safe to re-run).
4. **Then** drop `escrow_deductions_pending_source_type_check`.
5. **Then** add the composite FK.

Dropping the CHECK before step 3 leaves a window where an invalid value is storable. Adding the FK
before step 3 fails outright on any non-empty table.

## 6. Invariants Cursor must honour

- Idempotent throughout (`IF NOT EXISTS` / `NOT EXISTS` guards); safe to run twice.
- **Never** `DELETE` a catalog row to "clean up" — void-not-delete; deactivate via `is_active`.
- Migration number strictly above prod's ledger max, **re-checked at push time**. Max was
  `202609280000` on 2026-07-27, and both `202609190000` and `202609220000` are already taken.
- No new GL math. This spec moves no money and posts nothing; it constrains a *proposal* table.
- `driver_finance` already has `ih35_app` grants; adding an FK needs none. FK validation runs as the
  table owner and is not subject to RLS, so no policy change is required.

## 7. Verification (GUARD, live, after apply)

```sql
-- 1. the hardcoded dialect is gone
SELECT count(*) FROM pg_constraint WHERE conname = 'escrow_deductions_pending_source_type_check';
-- expect 0

-- 2. the FK exists and is composite
SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'driver_finance.escrow_deductions_pending'::regclass AND contype = 'f';
-- expect FOREIGN KEY (operating_company_id, source_type) REFERENCES catalogs.driver_deduction_types(...)

-- 3. a safety fine is now proposable — the gap this closes
SELECT count(*) FROM catalogs.driver_deduction_types WHERE code = 'SAFETY-FINE';
-- expect one row PER ENTITY
```

**Read-method warning.** `catalogs.driver_deduction_types`' only policy is
`company_scope => operating_company_id::text = current_setting('app.operating_company_id', true)`
with **no `app.bypass_rls='lucia'` escape branch**. `SET app.bypass_rls='lucia'` alone returns a
FALSE 0 on this table even when the bypass is demonstrably working (positive control
`mdata.drivers = 178`). Count it with the opco GUC or with `pg_class.n_live_tup`, never with the
lucia bypass alone. That missing branch is filed separately — see `docs/trackers/DEFERRED-ITEMS.md`.
Do **not** fix it inside this migration; widening an RLS policy is its own owner-reviewed change.

## 8. Guard to ship with it

A static guard asserting: no hardcoded recovery-reason CHECK anywhere in `db/migrations/` for
`escrow_deductions_pending`; the FK is composite (both columns) rather than code-only; and
`SAFETY-FINE` is present in the seed. RED before the migration, GREEN after — and the selftest must
mutate the real file, not a hand-written fixture.
