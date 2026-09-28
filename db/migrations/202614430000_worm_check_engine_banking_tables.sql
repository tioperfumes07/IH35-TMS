-- Migration: 202614430000_worm_check_engine_banking_tables
--
-- ROUND 155 (Claude Lead). The check engine's own migration 202614330000 (#22910) created four new
-- financial tables in the `banking` schema and attached RLS to all four, but no WORM
-- (void-not-delete) trigger. verify-worm-coverage-ratchet caught the regression the moment it
-- landed: unprotected financial tables rose 89 -> 93, and that red has been blocking EVERY push on
-- main since. This attaches the same refuse_financial_row_delete trigger every other banking ledger
-- table carries, and lowers the ratchet baseline back to 89.
--
-- THE PER-TABLE JUDGMENT, made deliberately rather than by default (the whole point of the ratchet):
--
--   banking.check_number_registry    PROTECT. This is the check-number ledger -- the single source of
--     truth for "is this number already used on this bank account". A deleted row makes a burned
--     check number reusable, which is how a company writes two live checks on one number. It already
--     carries status='voided' + voided_at + void_reason: void IS the designed exit, delete never was.
--
--   banking.check_print_batches      PROTECT. One row per "print these N checks now" action, with
--     confirmed_at/confirmed_by. It is the audit trail for a physical act that consumed real check
--     stock. QuickBooks does not let you erase print history either; a mis-print is reprinted and
--     the spoiled stock recorded, never deleted.
--
--   banking.check_print_batch_items  PROTECT. Per-check outcome inside that batch (ok / spoiled).
--     Deleting an item silently rewrites which checks a batch consumed -- the parent row would still
--     claim N checks printed with no record of which. Protecting the parent without the child is not
--     protection.
--
--   banking.check_stock_settings     PROTECT. Closest call of the four, because it reads like config
--     (next_check_number, offsets, check_type). It is protected anyway for one reason: it is keyed by
--     bank_account_id and carries next_check_number, the number every future check on that account is
--     drawn from. Deleting the row destroys the provenance of every check already printed against
--     that stock, and the row is designed to be UPDATEd (updated_at/updated_by_user_id), never
--     removed. WORM refuses DELETE only -- normal configuration edits are unaffected.
--
-- Additive only. Idempotent. No data. No hardcoded UUIDs. No DROP. Safe to re-run.

BEGIN;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'banking.check_number_registry',
    'banking.check_print_batches',
    'banking.check_print_batch_items',
    'banking.check_stock_settings'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = split_part(t, '.', 1)
         AND c.relname = split_part(t, '.', 2)
         AND c.relkind = 'r'
    ) AND NOT EXISTS (
      SELECT 1
        FROM pg_trigger tg
        JOIN pg_class c ON c.oid = tg.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = split_part(t, '.', 1)
         AND c.relname = split_part(t, '.', 2)
         AND tg.tgname = 'trg_worm_refuse_delete'
         AND NOT tg.tgisinternal
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON %s FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete()',
        t
      );
      RAISE NOTICE 'WORM: delete-refusal trigger attached to %', t;
    END IF;
  END LOOP;
END $$;

COMMIT;
