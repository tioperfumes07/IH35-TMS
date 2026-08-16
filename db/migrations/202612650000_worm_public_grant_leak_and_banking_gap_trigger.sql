-- ACCT-F5325 — the void-not-delete GRANT layer is leaking on `driver_finance` and `banking`: a
-- narrow `GRANT SELECT, INSERT, UPDATE` to `ih35_app` (deliberately no DELETE) is undermined because
-- PostgreSQL's implicit PUBLIC role independently carries DELETE on every table in both schemas, and
-- every role — `ih35_app` included — is automatically a member of PUBLIC. Live-measured on prod:
-- `has_table_privilege('ih35_app', <table>, 'DELETE')` returns TRUE via the PUBLIC grant on 34 of 37
-- driver_finance tables and all 12 banking tables, even though `ih35_app` was never directly granted
-- DELETE anywhere in either schema. This is the exact "a narrow GRANT is not always enough" class
-- documented for the `dispatch` schema's ALTER DEFAULT PRIVILEGES leak — here the leak vector is the
-- implicit PUBLIC grant instead, but the effect is identical: the intended restriction is cosmetic.
--
-- SEVERITY, TRIAGED BEFORE WRITING THIS MIGRATION: of the 34+12 leaked tables, ALL but three already
-- carry the `trg_worm_refuse_delete` BEFORE DELETE trigger (the "protected by either layer" law — a
-- trigger alone is sufficient), so this migration's REVOKE closes a real defense-in-depth gap without
-- being the only thing standing between the leak and an actual deletion. The three EXCEPTIONS —
-- `banking.intercompany_entity_pairs`, `banking.intercompany_transfer_groups`,
-- `banking.transaction_categories` — have NEITHER layer: these three are, right now, genuinely
-- deletable by `ih35_app` via the PUBLIC grant with zero trigger backstop. This migration closes both:
-- the grant leak (REVOKE, all tables) and the missing trigger (attach, these three tables only).
--
-- SCOPED TO driver_finance + banking ONLY — matches the original finding's exact scope
-- (LV-VOID-NOT-DELETE-UNENFORCED-ON-DRIVER-FINANCE-AND-BANKING). The same PUBLIC-DELETE leak also
-- exists on 17 `accounting.*` and 1 `factoring.*` table, deliberately NOT touched here: triage of
-- those found `factoring.bank_match_suggestion` has a LIVE, LEGITIMATE app-code DELETE
-- (bank-match.service.ts regenerates unapplied suggestion rows — pre-commit scratch, same exemption
-- class as `accounting.ap_import_preview_lines`) — a blanket revoke there would have broken working
-- code. The `accounting`/`factoring` leak needs its own per-table triage pass, not a copy-paste of
-- this migration; filed as its own board item rather than guessed at here.
--
-- Verified before writing: grep of apps/backend/src for `DELETE FROM driver_finance.<table>` /
-- `DELETE FROM banking.<table>` across every table this migration touches returns ZERO real
-- (non-test) call sites — nothing in live app code relies on deleting from any of these tables.
--
-- IDEMPOTENT: REVOKE on a role that already lacks the privilege is a no-op; CREATE TRIGGER guarded by
-- a NOT EXISTS check re-runs safely. ALTER DEFAULT PRIVILEGES prevents a FUTURE table in either
-- schema from silently re-opening the same leak.

BEGIN;

REVOKE DELETE ON ALL TABLES IN SCHEMA driver_finance FROM PUBLIC;
REVOKE DELETE ON ALL TABLES IN SCHEMA banking FROM PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA driver_finance REVOKE DELETE ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA banking REVOKE DELETE ON TABLES FROM PUBLIC;

-- Two tables carried a DIRECT `ih35_app` DELETE grant (not via PUBLIC) that the REVOKE above cannot
-- touch: `driver_finance.trip_link_queue` and `banking.transaction_categories`. Same triage as
-- `factoring.bank_match_suggestion` above — grep of apps/backend/src confirms ZERO live (non-test)
-- app-code DELETE against either, so this is the same unintentional-grant class, just granted
-- directly instead of via PUBLIC. Closed explicitly since REVOKE ... FROM PUBLIC does not touch a
-- role's own direct grant.
REVOKE DELETE ON driver_finance.trip_link_queue FROM ih35_app;
REVOKE DELETE ON banking.transaction_categories FROM ih35_app;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('banking', 'intercompany_entity_pairs'),
      ('banking', 'intercompany_transfer_groups'),
      ('banking', 'transaction_categories')
    ) AS t(schema_name, table_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = r.schema_name AND c.relname = r.table_name AND c.relkind = 'r'
    ) AND NOT EXISTS (
      SELECT 1
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = r.schema_name AND c.relname = r.table_name
         AND t.tgname = 'trg_worm_refuse_delete' AND NOT t.tgisinternal
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON %I.%I '
        || 'FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete()',
        r.schema_name, r.table_name
      );
      RAISE NOTICE 'ACCT-F5325: WORM delete-refusal trigger attached to %.%', r.schema_name, r.table_name;
    END IF;
  END LOOP;
END
$$;

COMMIT;
