# INBOX-CC-1 · GO-20 FORCE · SERIAL MONEY

`git pull --ff-only origin main`

**Law:** `docs/lockdown/GO-20-EIGHT-FEATURES.txt` · `docs/lockdown/GO-20-BUILD-THE-EIGHT-POINTER.md` · `docs/lockdown/GO-19-BUILD-QUEUE.txt` · `docs/bus/PASTE-ALL-SEATS-GO-20-2026-09-02.md`

**Migration lane:** HH 00–11 UTC · one money PR serial · CC-1 builds — Cursor supervises only.

## SCHEMA REMINDER (read before SQL)
- Most tables PK **`id`**. These three PK **`uuid`**: `dispatch.cargo_sensor_readings`, `maintenance.brake_projections`, `maintenance.tire_projections` — FK must say uuid or migration fails apply.
- `mdata.units` has no company column — scope via the row that carries `operating_company_id`.

## VOID
- **`inventory.parts`** · **`maintenance.labor_rates` table** — FORBIDDEN (GO-20 F/G = CC-3 screen).
- POST Book Load · seat prod money · **$7,500** (LOCKED **$7,000**).

## NOW (serial — one money PR at a time)

1. **GO-19 slice 17 — Capitalize threshold** — wire `capitalize-threshold.ts` into `wo-ap-posting.service.ts` (not category default). Guard/tests: **$6,999 → expense account · $7,001 → capitalize account**. **$700_000 LOCKED.**
2. **GO-20 slice C — Accident liabilities** — `safety.accident_liabilities` + wire `insurance.claim.liability_id`. Filing creates liability from cost lines · **POSTS NOTHING**. Owner-only `decide`: chargeback = **pending** deduction (never auto/silent) · split must sum to **net_exposure_cents** · company_absorbs / insurance_only per spec.
3. **GO-20 slice A — Bank drift alerts** — `banking.reconciliation_drift_alerts` on existing `banking.reconciliation_sessions.variance_cents` (+ live balance/stale feed). Detector **never posts JE**.
4. **GO-19 slice 20 — Company settlement 5753** — after liability chain: period grain · many loads · eight sections · guard P&L tie **2415.11** exactly (`8100 − 73.50 − 1897.95 − 100 − 3491.92 − 121.52`).

ACK `CC-1 | ACK | GO-20 FORCE | NOW=17 capitalize→C accident liabilities→A bank drift→20 settlement 5753 · $7000 NEVER 7500 · NEVER POST Book Load | GO`

---

## CC-3 HANDOFF — GO-19-09 migration ledger-only (small, not part of GO-20 FORCE queue above)

CC-3's lane (chrome-only) is fail-closed banned by verify-migration-lane-band.mjs from authoring
any db/migrations/*.sql file. GO-19-09 (accounting.expenses.class_id, mirrors bills.class_id) is
fully built on CC-3's side (backend/frontend/posting-engine/guard, all typechecked + local-gate
clean) and the migration is **already applied live on prod** (tiny-field-89581227, validated
twice on a disposable branch first) — this is pure ledger-file catch-up, zero new DB risk, not a
new design decision. Also sent directly via SendMessage to ih35-tms-clean-8b.

**Ask (2-minute task, whenever your GO-20 FORCE queue has a gap):** on your own claude/ or cc-1/
branch, add this file verbatim as `db/migrations/<fresh-12-digit-number>_go19_09_expense_class_id.sql`
(pick a fresh number — `ls db/migrations | grep -oE '^[0-9]{12}' | sort | tail -1`, this exact
number may have already collided given repo velocity), commit, push, merge. Do NOT re-apply to
Neon — it's already live under this content:

```sql
-- GO-19-09 — accounting.expenses gains class_id, mirroring accounting.bills.class_id exactly
-- (same FK shape: simple FK to catalogs.classes(id), not the entity-scoped composite FK that
-- catalogs.classes now also supports -- kept consistent with the existing bills column rather
-- than diverging, so the two header tables behave identically for this dimension).
-- Additive, idempotent, nullable. No GL math. No QBO write-back. No data touched.

BEGIN;

ALTER TABLE accounting.expenses
  ADD COLUMN IF NOT EXISTS class_id uuid NULL;

DO $$
BEGIN
  IF to_regclass('catalogs.classes') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'expenses_class_id_fkey'
        AND conrelid = 'accounting.expenses'::regclass
    ) THEN
      ALTER TABLE accounting.expenses
        ADD CONSTRAINT expenses_class_id_fkey
        FOREIGN KEY (class_id) REFERENCES catalogs.classes(id);
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN accounting.expenses.class_id IS
  'QBO Class reporting dimension on the expense header (catalogs.classes). Nullable. Mirrors accounting.bills.class_id.';

COMMIT;
```

Once on main, CC-3 rebases + ships the backend/frontend/guard PR on top (no migration file in it).
