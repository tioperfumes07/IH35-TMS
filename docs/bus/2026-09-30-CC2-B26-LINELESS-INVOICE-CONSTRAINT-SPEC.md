# B-26 — lineless-invoice-header constraint, migration spec for CC-1

CC-2 is hard-barred from authoring migrations (`scripts/verify-migration-lane-band.mjs`, `cc2/`/
`cc-2/` branch prefixes fail closed by design). B-26 (Lead order, docs/bus/NOW-CC-2.md ROUND 294)
asks for "a lineless invoice header impossible AT THE TABLE (migration+constraint, not call-site)."
Handing the exact spec to CC-1 (schema/migrations lane) rather than attempting it myself.

## Why a CHECK constraint doesn't work

Postgres CHECK constraints can't reference another table (`accounting.invoice_lines`), so "at
least one line exists" can't be expressed as a plain CHECK on `accounting.invoices`.

## Proposed shape: a DEFERRABLE constraint trigger

```sql
CREATE OR REPLACE FUNCTION accounting.enforce_invoice_has_lines() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM accounting.invoice_lines WHERE invoice_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'invoice % has no invoice_lines rows -- an invoice header may not be created without at least one line', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER invoice_must_have_lines
  AFTER INSERT ON accounting.invoices
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.voided_at IS NULL)
  EXECUTE FUNCTION accounting.enforce_invoice_has_lines();
```

Design notes:
- **`AFTER INSERT` only, not `UPDATE`.** The Lead's own wording is "stop the NEXT one at the
  database" — this is about preventing new zero-line headers, not retroactively enforcing on the
  5 known-bad existing rows (see `docs/bus/2026-09-30-CC2-B26-EVIDENCE-TABLE-THE-5.md`). If this
  also fired on UPDATE, any future status change or void on those 5 existing rows would itself be
  blocked by the same constraint it's trying to add — the opposite of what's wanted.
- **`DEFERRABLE INITIALLY DEFERRED`** so it fires at COMMIT, not immediately on the `INSERT` — the
  standard pattern (`buildInvoiceFromLoad` and every other writer this session found) inserts the
  header first, then the line(s), in the same transaction. An immediate (non-deferred) trigger
  would refuse the header the instant it's inserted, before the line insert ever runs.
- **`WHEN (NEW.voided_at IS NULL)`** — a voided invoice's own creation isn't the target here
  (void-then-recreate flows, if any exist, shouldn't trip this).
- Verify-step guard: `scripts/verify-invoice-header-requires-line-constraint.mjs` should assert
  (a) the migration created the trigger (via `information_schema.triggers` or
  `pg_trigger`/`pg_get_triggerdef`), and (b) a live INSERT-header-with-no-lines inside a
  transaction that commits without ever inserting a line is refused (dry-run / rollback, no
  --apply needed for the assertion itself).

## What this does NOT do

Does not touch, repair, or void the 5 existing zero-line invoices (13616/13618/13620/13621/13622)
— those are the evidence-table's subject, an owner decision, not a data write to make here.
