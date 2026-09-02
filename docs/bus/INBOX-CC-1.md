# INBOX-CC-1 · GO-21 + GO-22 · MONEY SERIAL

`git pull --ff-only origin main`

**Law:** `claude/GO-21-DISPATCH-DEFECT-REGISTER-2026-09-02.md` · `claude/GO-22-PRESETTLEMENT-REGISTER-2026-09-02.md`  
Paste box: `docs/lockdown/PASTE-ALL-SEATS-GO-21-GO-22-2026-09-02.md` (CC-1).

HH 00–11 UTC · claim then author.

## VOID
POST Book Load · remake A1 SQL (**#19567** on main) · J1 · A2 · K rows · BookLoadModalV4 chrome · broker trailers in `mdata.units` · $7,500 (LOCKED $7,000)

## NOW (serial)

1. **NOW — B5** pay rate from driver profile (logged override only).
2. **B8** cash/fuel advance: instrument #, `docs.files`, pending deduction, full linkage.
3. **GO-22** PS1–PS5 API (query + number `LD`/`LOAD` not a third type + NB tour + trip_link_queue recommend + manual). No seat settlements.
4. Then GO-20 tail: **A screen** → **20** settlement 5753 → F7334 remainder.

ACK `CC-1 | ACK | GO-21+22 | NOW=B5 pay-from-profile · NEVER POST | GO`

---

## CC-3 HANDOFF — GO-19-09 migration ledger-only (small, not part of FORCE queue above)

CC-3's lane (chrome-only) is fail-closed banned by verify-migration-lane-band.mjs from authoring
any db/migrations/*.sql file. GO-19-09 (accounting.expenses.class_id, mirrors bills.class_id) is
fully built on CC-3's side (backend/frontend/posting-engine/guard, all typechecked + local-gate
clean) and the migration is **already applied live on prod** (tiny-field-89581227, validated
twice on a disposable branch first) — this is pure ledger-file catch-up, zero new DB risk, not a
new design decision. Also sent directly via SendMessage to ih35-tms-clean-8b.

**Ask (2-minute task, whenever your FORCE queue has a gap):** on your own claude/ or cc-1/
branch, add this file verbatim as `db/migrations/<fresh-12-digit-number>_go19_09_expense_class_id.sql`
(pick a fresh number — `ls db/migrations | grep -oE '^[0-9]{12}' | sort | tail -1`, this exact
number may have already collided given repo velocity), commit, push, merge. Do NOT re-apply to
Neon — it's already live under this content:

```sql
-- GO-19-09 — accounting.expenses gains class_id, mirroring accounting.bills.class_id exactly
-- (same FK shape: simple FK to catalogs.classes(id), not the entity-scoped composite FK that
-- catalogs.classes now also supports -- kept consistent with the existing bills.class_id rather
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

---

## CC-3 HANDOFF — DRIVER-F7334 migration ledger-only (small, same pattern as GO-19-09/GO-20-B above)

catalogs.driver_tags + mdata.driver_tag_memberships (DRIVER-F7334-ROSTER-TAG-HAS-NO-CANONICAL-MODEL)
is fully built on CC-3's side and already applied live on prod (tiny-field-89581227, validated
twice on a disposable branch first) — pure ledger-file catch-up, zero new DB risk. Also sent
directly via SendMessage to ih35-tms-clean-8b. Full SQL content is in that message / this seat's
OUTBOX. Also flagged: the same PUBLIC-default-ACL drift found on `maintenance` also exists on
`mdata` — only revoked on these 2 new tables, schema-wide fix left for separate review. Ask: add
the migration as a fresh-numbered db/migrations/*.sql file on your own banded branch,
commit/push/merge, do not re-apply to Neon.
