-- H-3 — THE TABLE REFUSES A MIRROR-ONLY LEDGER ROW.
--
-- WHY THIS EXISTS, measured 2026-09-30: five migrations were applied outside applyMigration(), so
-- ih35_migrations.applied_migrations (mirror) carried a row for each while
-- _system._schema_migrations (canonical) carried none. LV-087 refuses on ANY unexplained
-- mirror-only row anywhere in the ledger -- not just the caller's own number -- so db-migrate.mjs
-- refused for EVERY SEAT and every backend deploy died with it. Three applied migrations were also
-- edited after apply the same afternoon. Eight incidents in one day, each one company-wide.
--
-- A standing rule in a doc did not stop it. The table does.
--
-- THE DANGER THIS CLOSES, in db-migrate.mjs's own words: backend boot accepts a migration present
-- in EITHER ledger, so a mirror-only row can make an UNAPPLIED migration look applied. That is the
-- direction that silently skips real DDL.
--
-- WHY IT IS SAFE AGAINST THE SANCTIONED PATH, verified before this file was written rather than
-- assumed: insertLedgerRow() inserts the CANONICAL row first (db-migrate.mjs:392) and the MIRROR
-- row second (:400), both from the same `file` variable, so the spellings are identical and the
-- canonical row always exists inside the same transaction by the time the mirror insert fires.
-- A legitimate apply therefore passes. Only an out-of-band mirror write is refused.
--
-- HONEST HISTORY: the trigger below reached production on 2026-09-30 by an unintended raw-SQL slip
-- during CC-1's design verification -- an embedded BEGIN;/COMMIT; in their working file committed
-- an outer "test" transaction for real -- and the migration was then never merged, so it sat in
-- NEITHER ledger while the trigger ran live. This file is authored to match what is already in
-- production byte for byte, carries NO transaction control of its own (that was the defect), and
-- is fully idempotent, so applying it through the sanctioned path is a no-op that writes only the
-- two ledger rows that were missing.

CREATE OR REPLACE FUNCTION ih35_migrations.refuse_mirror_only_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM _system._schema_migrations WHERE filename = NEW.name
  ) THEN
    RAISE EXCEPTION 'ih35_migrations.applied_migrations refuses a mirror-only row for "%" -- the canonical ledger (_system._schema_migrations) has no matching filename. Never write this table directly. Apply migrations ONLY via scripts/db-migrate.mjs''s applyMigration() (locally: npm run db:migrate; on prod: ALLOW_PROD_MIGRATE=1 npm run db:migrate). A mirror-only row is exactly the shape that trips LV-087 and freezes db:migrate for every seat.', NEW.name
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_refuse_mirror_only_insert ON ih35_migrations.applied_migrations;

CREATE TRIGGER trg_refuse_mirror_only_insert
  BEFORE INSERT ON ih35_migrations.applied_migrations
  FOR EACH ROW EXECUTE FUNCTION ih35_migrations.refuse_mirror_only_insert();
