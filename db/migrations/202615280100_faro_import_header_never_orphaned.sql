-- Lead ROUND 330.6 (CC-1) — a factor.faro_daily_imports header must never outlive all of its live lines. Prod held two
-- headers ($311,587.00 statement 2026-09-04, $45,200.00 statement 2026-08-09) whose lines were all gone (104 line deletes
-- recorded on faro_invoice_lines); the factor reconciliation then showed both statements with a full-amount variance
-- against zero lines. The FK cascades header -> lines, but nothing stopped lines going without their header.
--
-- Deferred constraint trigger: at COMMIT, if a header a deleted / superseded / moved line belonged to still exists, it
-- must have at least one live (superseded_at IS NULL) line. Deleting the header (lines cascade with it) passes; a
-- re-import that supersedes the old lines and appends the new ones in one transaction passes; deleting or superseding
-- the last live lines while the header stays refuses (23514) and the transaction rolls back. Idempotent.
BEGIN;
CREATE OR REPLACE FUNCTION factor.assert_faro_import_keeps_live_lines() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM factor.faro_daily_imports h WHERE h.id = OLD.daily_import_id)
     AND NOT EXISTS (
       SELECT 1 FROM factor.faro_invoice_lines l
        WHERE l.daily_import_id = OLD.daily_import_id AND l.superseded_at IS NULL
     ) THEN
    RAISE EXCEPTION 'factor.faro_daily_imports % would be left with no live lines — delete the import header with its lines (or append replacement lines in the same transaction); never orphan it', OLD.daily_import_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_faro_lines_keep_import_live ON factor.faro_invoice_lines;
CREATE CONSTRAINT TRIGGER trg_faro_lines_keep_import_live
  AFTER DELETE OR UPDATE OF superseded_at, daily_import_id ON factor.faro_invoice_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION factor.assert_faro_import_keeps_live_lines();
COMMIT;
