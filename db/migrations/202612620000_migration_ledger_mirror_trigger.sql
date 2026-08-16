-- LV-087-MIRROR-TRIGGER — make canonical-only ledger drift IMPOSSIBLE by construction.
--
-- WHY (measured, not theorised). db-migrate.mjs writes BOTH ledgers via insertLedgerRow(), but any
-- out-of-band apply -- psql, the Neon console, a hand-run script -- writes _system._schema_migrations
-- alone. That canonical-only row trips the LV-087 refusal, and because pre-deploy runs `db:migrate`
-- FIRST, every backend deploy dies until a human diagnoses it. This happened THREE times in one night
-- (2026-08-16), each needing a hand repair:
--   01:06Z  202612581400_owner_all_entities_non_qbo_flags_on.sql   cursor-usmca-lead   6 failed deploys
--   02:34Z  202608152230_seed_driver_pay_types_accessorials.sql    neondb_owner        5 failed deploys
--   08:12Z  202608161230_archive_dead_seeded_feature_flags.sql     neondb_owner        blocked again
-- A control that needs a human every few hours is not a control.
--
-- WHAT THIS DOES: an AFTER INSERT row trigger on the canonical ledger copies the filename into the
-- mirror. insertLedgerRow() already inserts both and ON CONFLICT DO NOTHING makes the trigger a no-op
-- on that path -- the normal flow is unchanged; the out-of-band flow becomes self-healing.
--
-- WHAT THIS DELIBERATELY DOES NOT DO: it never touches the reverse direction. A MIRROR-only row is the
-- dangerous one -- backend boot accepts a migration present in EITHER ledger, so a mirror-only row can
-- make an UNAPPLIED migration look applied. LV-087 must keep refusing that, and it still does. This
-- trigger only ever writes canonical -> mirror, safe because the canonical ledger is written only
-- after a successful apply.
--
-- ADDITIVE. Idempotent. No DELETE. No money. No RLS change.
-- Verified on Neon branch br-floral-truth-akrqjhd4 (fork of prod): applied twice -> 1 trigger (idempotent);
-- probe INSERT into canonical -> mirror row auto-created; reverse direction untouched.

DO $mig$
BEGIN
  IF to_regclass('_system._schema_migrations') IS NULL
     OR to_regclass('ih35_migrations.applied_migrations') IS NULL THEN
    RAISE NOTICE 'LV-087-MIRROR-TRIGGER: ledger tables absent - skip';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION ih35_migrations.__mirror_canonical_ledger_row()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, ih35_migrations
    AS $body$
    BEGIN
      INSERT INTO ih35_migrations.applied_migrations (name)
      VALUES (NEW.filename)
      ON CONFLICT (name) DO NOTHING;
      RETURN NEW;
    END;
    $body$;
  $fn$;

  EXECUTE 'DROP TRIGGER IF EXISTS trg_mirror_canonical_ledger_row ON _system._schema_migrations';
  EXECUTE 'CREATE TRIGGER trg_mirror_canonical_ledger_row '
       || 'AFTER INSERT ON _system._schema_migrations '
       || 'FOR EACH ROW EXECUTE FUNCTION ih35_migrations.__mirror_canonical_ledger_row()';

  RAISE NOTICE 'LV-087-MIRROR-TRIGGER: installed';
END
$mig$;
