-- 202615410400_cash_basis_snapshot_admits_auth_listed_purge.sql
-- CC-1 · AUTH-400 CLEAN SLATE — the locked period cash-basis snapshot admits the owner's row-by-row purge, nothing more.
--
-- The AUTH-400 purge rehearsal (br-small-leaf-akjde74y) rolled back on "IH35_CASH_BASIS_SNAPSHOT_LOCKED": a computed
-- snapshot refused DELETE from every role with no arm, so a snapshot of the old ledger's figures (a trace, owner law
-- "NO TRACE OF ANY PREVIOUS DOCUMENT") could never be removed. Same arm every other WORM table has (ARM L,
-- 202615410200 for escrow_postings / stop_arrivals):
--   * DELETE only, and only a row listed in _system.purge_authorized_rows for app.purge_auth_id (^AUTH-[0-9]+$);
--   * UPDATE of a computed snapshot stays refused for every role, always;
--   * an uncomputed snapshot behaves exactly as before.
-- Idempotent (CREATE OR REPLACE). No data changes. No trigger added, dropped or re-pointed.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION accounting.period_cash_basis_snapshot_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_auth text := NULLIF(current_setting('app.purge_auth_id', true), '');
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.computed_at IS NOT NULL THEN
    RAISE EXCEPTION 'IH35_CASH_BASIS_SNAPSHOT_LOCKED period_id=%', OLD.period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.computed_at IS NOT NULL THEN
    IF v_auth ~ '^AUTH-[0-9]+$' AND to_regclass('_system.purge_authorized_rows') IS NOT NULL
       AND EXISTS (SELECT 1 FROM _system.purge_authorized_rows r
                    WHERE r.auth_id = v_auth AND r.table_name = 'accounting.period_cash_basis_snapshot'
                      AND r.row_pk = (to_jsonb(OLD) ->> 'id')) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'IH35_CASH_BASIS_SNAPSHOT_LOCKED period_id=%', OLD.period_id
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
