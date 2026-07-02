# Faro Vendor Dedupe — Owner Ceremony Plan (decision #7)

**Status:** owner-executed (prod data move — §1.5/§1.6, Jorge's hand). This is the plan + proof template;
the actual UPDATE/void is run by the owner against a gated connection after reviewing the diagnostic.

## Decision (locked 2026-07-02)
Faro Factoring is duplicated in `mdata.vendors`:
- **Canonical:** id `3585f27e…` — the QBO-linked row (keep).
- **Duplicate:** id `6dd1f7f5…` — merge any terms from it, **repoint every FK** that references it to the
  canonical row, then **VOID** it (`is_active=false` + `deactivated_at=now()`, never `DELETE`).

## Step 1 — discover the live FK graph (read-only, changes nothing)
```
DATABASE_URL=<gated read conn> node scripts/faro-vendor-dedupe-diagnostic.mjs
```
It prints: both Faro rows, every FK referencing `mdata.vendors`, and per referencing column the count of
rows currently pointing at the duplicate. Nothing to repoint if a column shows 0.

## Step 2 — merge terms (owner, if the duplicate carries fields the canonical lacks)
Only fields the canonical row is missing (e.g. payment terms, NOA metadata). Do NOT overwrite the
canonical `qbo_vendor_id`. Owner-reviewed, one column at a time.

## Step 3 — repoint FKs (owner ceremony; proof-then-commit)
For EACH `(table, column)` the diagnostic reported with `rows_on_duplicate > 0`, run the repoint. Prove
first inside a transaction, eyeball the count, then commit:
```sql
BEGIN;
-- repeat per referencing (table.column) from the diagnostic:
UPDATE <schema.table>
   SET <fk_column> = '<CANONICAL_UUID>'::uuid,
       updated_at  = now()          -- only if the table has updated_at
 WHERE <fk_column> = '<DUP_UUID>'::uuid;
-- ... all referencing tables ...
-- verify nothing still points at the duplicate:
--   (re-run the diagnostic's per-column counts here; every one must be 0)
COMMIT;   -- or ROLLBACK if any count is unexpected
```

## Step 4 — VOID the duplicate (never delete)
```sql
UPDATE mdata.vendors
   SET is_active = false,
       deactivated_at = now()
 WHERE id = '<DUP_UUID>'::uuid
   AND id::text LIKE '6dd1f7f5%';   -- belt-and-suspenders id guard
```

## Guardrails
- Repoint BEFORE voiding (a live FK to a voided vendor is worse than the dup).
- Never `DELETE` the duplicate — void preserves the audit trail (§2 void-not-delete).
- Re-run the diagnostic after Step 3 and confirm every referencing column shows 0 rows on the duplicate
  before Step 4.
- All within the correct entity's RLS scope (`SET app.operating_company_id` if reads come back empty).
- Cross-ref: canonical-Faro decision #7; factoring = secured-borrowing CoA roles (migration
  202607013000).
