-- 202615410200_append_only_tables_admit_auth_listed_purge.sql
-- CC-1 · AUTH-400 CLEAN SLATE (owner law 2026-10-04: "NO TRACE OF ANY PREVIOUS DOCUMENT, LOAD, INVOICE ...").
--
-- Two append-only tables refused DELETE from EVERY role with no arm at all, so the ROUND 390 purge dry run retained
-- them: accounting.escrow_postings (183 USMCA rows) and dispatch.stop_arrivals (8). Every other WORM table already
-- admits the owner's row-by-row list (ARM L: accounting.refuse_financial_row_delete, fuel.refuse_source_row_delete).
-- This gives these two the SAME arm and nothing more:
--   * DELETE only, and only a row listed in _system.purge_authorized_rows for the AUTH named in app.purge_auth_id
--     (^AUTH-[0-9]+$). The purge engine lists every row it removes and records each in audit.record_deletions.
--   * UPDATE stays refused for every role, always (append-only means no edit, ever).
--   * no AUTH, or a row not listed for it -> the same refusal as before.
-- Idempotent (CREATE OR REPLACE). No data changes. No trigger is added, dropped or re-pointed.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION accounting.prevent_escrow_posting_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_auth text := NULLIF(current_setting('app.purge_auth_id', true), '');
BEGIN
  IF TG_OP = 'DELETE' AND v_auth ~ '^AUTH-[0-9]+$' AND to_regclass('_system.purge_authorized_rows') IS NOT NULL
     AND EXISTS (SELECT 1 FROM _system.purge_authorized_rows r
                  WHERE r.auth_id = v_auth AND r.table_name = 'accounting.escrow_postings' AND r.row_pk = (to_jsonb(OLD) ->> 'id')) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'accounting.escrow_postings is append-only';
END;
$fn$;

CREATE OR REPLACE FUNCTION dispatch.stop_arrivals_delete_block()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_auth text := NULLIF(current_setting('app.purge_auth_id', true), '');
BEGIN
  IF v_auth ~ '^AUTH-[0-9]+$' AND to_regclass('_system.purge_authorized_rows') IS NOT NULL
     AND EXISTS (SELECT 1 FROM _system.purge_authorized_rows r
                  WHERE r.auth_id = v_auth AND r.table_name = 'dispatch.stop_arrivals' AND r.row_pk = (to_jsonb(OLD) ->> 'id')) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'dispatch.stop_arrivals is append-only — DELETE is not allowed';
END;
$fn$;

COMMIT;
