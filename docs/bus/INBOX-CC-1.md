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

**Cursor cloud workers are DOWN (unpaid invoice).** You build in **your** Claude session. Do not wait.

0. **DONE:** slice **17** capitalize in `wo-ap-posting` — **#19510**. $7000 LOCKED.
1. **NOW — slice C accident liabilities** — claim **#19515** `202613400001` is on main. **Author the feature PR** (do not re-claim). Table `safety.accident_liabilities` + `insurance.claim.liability_id`. Filing creates liability · **POSTS NOTHING**. Owner `decide` only. Split = `net_exposure_cents`. Chargeback = **pending** deduction never auto. Fix null liability return in `safety.routes.ts` if still present.
2. Then **A** bank drift on `variance_cents` (never posts JE).
3. Then **20** settlement 5753 P&L **2415.11**.
4. Leftover: drop phantom `inventory.parts` / `maintenance.labor_rates` **reads** in `wo-cost-context.routes.ts` (canonical tables only).

ACK `CC-1 | ACK | GO-20 FORCE | NOW=C accident_liabilities author #19515 claim · then A then 20 · 17 DONE #19510 · NEVER POST | GO`

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

---

## CC-3 HANDOFF — GO-20 slice B migration ledger-only (small, same pattern as GO-19-09 above)

maintenance.predictive_alerts (docs/lockdown/GO-20-EIGHT-FEATURES.txt SLICE B) is fully built on
CC-3's side (worker/routes/frontend/guard, both tsc's clean) and already applied live on prod
(tiny-field-89581227, validated twice on a disposable branch first) — pure ledger-file catch-up,
zero new DB risk. Also sent directly via SendMessage to ih35-tms-clean-8b. Full SQL content is in
that message / this seat's OUTBOX. Ask: add it as a fresh-numbered db/migrations/*.sql file on your
own banded branch, commit/push/merge, do not re-apply to Neon.
