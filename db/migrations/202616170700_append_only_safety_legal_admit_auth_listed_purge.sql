-- 202616170700_append_only_safety_legal_admit_auth_listed_purge.sql
-- CC-2 · LEAD 443.247 (10-22 20:45Z) — OWNER, verbatim 3:36 PM CT 10-22: "test recrods shuold be deleted permanently".
--
-- Eleven append-only trigger functions on safety / legal tables refuse DELETE from EVERY role with no arm at all, so the
-- owner's permanent delete of PROVABLY TEST rows cannot run through the one purge engine (accounting._purge_rows_cascade):
--   safety.prevent_event_delete               — safety.accidents, citations, event_documents, fmcsa_events,
--                                                roadside_inspections, violations
--   safety.block_safety_events_mutation        — safety.safety_events
--   safety.block_safety_event_notes_mutation   — safety.safety_event_notes
--   safety.block_dvir_defects_mutation         — safety.dvir_defects (its UPDATE rules are unchanged, verbatim)
--   safety.block_dvir_severity_tags_mutation   — safety.dvir_defect_severity_tags
--   legal.block_matter_events_mutate           — legal.matter_events
--   legal.block_contract_audit_log_mutation    — legal.contract_audit_log
--   safety.block_driver_leave_audit_mutation   — safety.driver_leave_audit_log
--   safety.block_dvir_submissions_delete       — safety.dvir_submissions
--   safety.block_harsh_events_mutation         — safety.harsh_events (only a listed TEST-id row; Samsara rows are never listed)
--   telematics.block_vehicle_driver_assignments_delete — telematics.vehicle_driver_assignments
-- This gives them the SAME arm every other WORM / append-only table already has (ARM L — 202615410200, 202615410500)
-- and nothing more:
--   * DELETE only, and only a row listed in _system.purge_authorized_rows for the AUTH named in app.purge_auth_id
--     (^AUTH-[0-9]+$), matched on this table's own schema.name and the row's id. The purge engine records every row it
--     removes in audit.record_deletions (who, when, reason, the full row).
--   * UPDATE stays refused for every role, always.
--   * no AUTH, or a row not listed for it -> the same refusal as before, same message.
-- Idempotent (CREATE OR REPLACE). No data changes. No trigger is added, dropped or re-pointed.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION safety.prevent_event_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_auth text := NULLIF(current_setting('app.purge_auth_id', true), '');
BEGIN
  IF TG_OP = 'DELETE' AND v_auth ~ '^AUTH-[0-9]+$' AND to_regclass('_system.purge_authorized_rows') IS NOT NULL
     AND EXISTS (SELECT 1 FROM _system.purge_authorized_rows r
                  WHERE r.auth_id = v_auth AND r.table_name = TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME AND r.row_pk = (to_jsonb(OLD) ->> 'id')) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is a permanent safety record — DELETE is not allowed', TG_TABLE_NAME;
END;
$fn$;

CREATE OR REPLACE FUNCTION safety.block_safety_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_auth text := NULLIF(current_setting('app.purge_auth_id', true), '');
BEGIN
  IF TG_OP = 'DELETE' AND v_auth ~ '^AUTH-[0-9]+$' AND to_regclass('_system.purge_authorized_rows') IS NOT NULL
     AND EXISTS (SELECT 1 FROM _system.purge_authorized_rows r
                  WHERE r.auth_id = v_auth AND r.table_name = TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME AND r.row_pk = (to_jsonb(OLD) ->> 'id')) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'safety.safety_events is append-only — % is not allowed', TG_OP;
END;
$fn$;

CREATE OR REPLACE FUNCTION safety.block_safety_event_notes_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_auth text := NULLIF(current_setting('app.purge_auth_id', true), '');
BEGIN
  IF TG_OP = 'DELETE' AND v_auth ~ '^AUTH-[0-9]+$' AND to_regclass('_system.purge_authorized_rows') IS NOT NULL
     AND EXISTS (SELECT 1 FROM _system.purge_authorized_rows r
                  WHERE r.auth_id = v_auth AND r.table_name = TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME AND r.row_pk = (to_jsonb(OLD) ->> 'id')) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'safety.safety_event_notes is append-only — % is not allowed', TG_OP;
END;
$fn$;

CREATE OR REPLACE FUNCTION safety.block_dvir_severity_tags_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_auth text := NULLIF(current_setting('app.purge_auth_id', true), '');
BEGIN
  IF TG_OP = 'DELETE' AND v_auth ~ '^AUTH-[0-9]+$' AND to_regclass('_system.purge_authorized_rows') IS NOT NULL
     AND EXISTS (SELECT 1 FROM _system.purge_authorized_rows r
                  WHERE r.auth_id = v_auth AND r.table_name = TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME AND r.row_pk = (to_jsonb(OLD) ->> 'id')) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'safety.dvir_defect_severity_tags is append-only — % is not allowed', TG_OP;
END;
$fn$;

CREATE OR REPLACE FUNCTION legal.block_matter_events_mutate()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_auth text := NULLIF(current_setting('app.purge_auth_id', true), '');
BEGIN
  IF TG_OP = 'DELETE' AND v_auth ~ '^AUTH-[0-9]+$' AND to_regclass('_system.purge_authorized_rows') IS NOT NULL
     AND EXISTS (SELECT 1 FROM _system.purge_authorized_rows r
                  WHERE r.auth_id = v_auth AND r.table_name = TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME AND r.row_pk = (to_jsonb(OLD) ->> 'id')) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'legal.matter_events is append-only — % is not allowed', TG_OP;
END;
$fn$;

CREATE OR REPLACE FUNCTION legal.block_contract_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_auth text := NULLIF(current_setting('app.purge_auth_id', true), '');
BEGIN
  IF TG_OP = 'DELETE' AND v_auth ~ '^AUTH-[0-9]+$' AND to_regclass('_system.purge_authorized_rows') IS NOT NULL
     AND EXISTS (SELECT 1 FROM _system.purge_authorized_rows r
                  WHERE r.auth_id = v_auth AND r.table_name = TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME AND r.row_pk = (to_jsonb(OLD) ->> 'id')) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'legal.contract_audit_log is append-only — % is not allowed', TG_OP;
END;
$fn$;

CREATE OR REPLACE FUNCTION safety.block_driver_leave_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_auth text := NULLIF(current_setting('app.purge_auth_id', true), '');
BEGIN
  IF TG_OP = 'DELETE' AND v_auth ~ '^AUTH-[0-9]+$' AND to_regclass('_system.purge_authorized_rows') IS NOT NULL
     AND EXISTS (SELECT 1 FROM _system.purge_authorized_rows r
                  WHERE r.auth_id = v_auth AND r.table_name = TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME AND r.row_pk = (to_jsonb(OLD) ->> 'id')) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'safety.driver_leave_audit_log is append-only — % is not allowed', TG_OP;
END;
$fn$;

CREATE OR REPLACE FUNCTION safety.block_dvir_submissions_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_auth text := NULLIF(current_setting('app.purge_auth_id', true), '');
BEGIN
  IF TG_OP = 'DELETE' AND v_auth ~ '^AUTH-[0-9]+$' AND to_regclass('_system.purge_authorized_rows') IS NOT NULL
     AND EXISTS (SELECT 1 FROM _system.purge_authorized_rows r
                  WHERE r.auth_id = v_auth AND r.table_name = TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME AND r.row_pk = (to_jsonb(OLD) ->> 'id')) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'safety.dvir_submissions is append-only — DELETE is not allowed';
END;
$fn$;

CREATE OR REPLACE FUNCTION safety.block_harsh_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_auth text := NULLIF(current_setting('app.purge_auth_id', true), '');
BEGIN
  IF TG_OP = 'DELETE' AND v_auth ~ '^AUTH-[0-9]+$' AND to_regclass('_system.purge_authorized_rows') IS NOT NULL
     AND EXISTS (SELECT 1 FROM _system.purge_authorized_rows r
                  WHERE r.auth_id = v_auth AND r.table_name = TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME AND r.row_pk = (to_jsonb(OLD) ->> 'id')) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'safety.harsh_events is append-only — % is not allowed', TG_OP;
END;
$fn$;

CREATE OR REPLACE FUNCTION telematics.block_vehicle_driver_assignments_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_auth text := NULLIF(current_setting('app.purge_auth_id', true), '');
BEGIN
  IF TG_OP = 'DELETE' AND v_auth ~ '^AUTH-[0-9]+$' AND to_regclass('_system.purge_authorized_rows') IS NOT NULL
     AND EXISTS (SELECT 1 FROM _system.purge_authorized_rows r
                  WHERE r.auth_id = v_auth AND r.table_name = TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME AND r.row_pk = (to_jsonb(OLD) ->> 'id')) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'telematics.vehicle_driver_assignments is append-only — DELETE is not allowed';
END;
$fn$;

CREATE OR REPLACE FUNCTION safety.block_dvir_defects_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_auth text := NULLIF(current_setting('app.purge_auth_id', true), '');
BEGIN
  IF TG_OP = 'DELETE' AND v_auth ~ '^AUTH-[0-9]+$' AND to_regclass('_system.purge_authorized_rows') IS NOT NULL
     AND EXISTS (SELECT 1 FROM _system.purge_authorized_rows r
                  WHERE r.auth_id = v_auth AND r.table_name = TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME AND r.row_pk = (to_jsonb(OLD) ->> 'id')) THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'safety.dvir_defects is append-only — DELETE is not allowed';
  END IF;

  -- UPDATE: only follow_up_wo_id may change (triage convert-to-WO linkage).
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.operating_company_id IS DISTINCT FROM OLD.operating_company_id
     OR NEW.dvir_submission_id IS DISTINCT FROM OLD.dvir_submission_id
     OR NEW.unit_id IS DISTINCT FROM OLD.unit_id
     OR NEW.item_key IS DISTINCT FROM OLD.item_key
     OR NEW.severity IS DISTINCT FROM OLD.severity
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.photo_keys IS DISTINCT FROM OLD.photo_keys
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
     OR NEW.major_defect_code IS DISTINCT FROM OLD.major_defect_code
  THEN
    RAISE EXCEPTION 'safety.dvir_defects is append-only — only follow_up_wo_id may be updated';
  END IF;

  -- Set-once: NULL → value only; never clear or overwrite an existing WO link.
  IF OLD.follow_up_wo_id IS NOT NULL
     AND NEW.follow_up_wo_id IS DISTINCT FROM OLD.follow_up_wo_id THEN
    RAISE EXCEPTION 'safety.dvir_defects.follow_up_wo_id is immutable once set';
  END IF;

  RETURN NEW;
END;
$fn$;


-- ── LEAD 443.247 engine fix: integer-id children ─────────────────────────────────────────────────────────────────────
-- Rehearsal (fork, 10-22) refused the purge with "invalid input syntax for type uuid": a child table keyed by an integer
-- id was collected into uuid[]. Same function, one new branch (a non-uuid-id child is deleted by its FK and recorded);
-- every other line is 202615290200's, verbatim. WORM triggers still decide permission on every DELETE.
CREATE OR REPLACE FUNCTION accounting._purge_rows_cascade(p_schema text, p_table text, p_ids uuid[], p_company uuid, p_auth text, p_actor uuid, p_reason text, p_depth integer DEFAULT 0)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
/*
 * ROUND 331 — recursive, FK-DISCOVERED deletion with a DECLARED BOUNDARY.
 *
 * FOUR facts forced this shape, every one found by RUNNING it on a branch, not by reasoning:
 *   1. A hand-ordered list cannot be right. mdata.loads has ~85 referencing FKs whose children
 *      have children (accounting.expenses -> accounting.expense_lines). A typed list missed
 *      dispatch.load_charge_lines; a one-level loop then failed on expense_lines_expense_id_fkey.
 *   2. An UNBOUNDED cascade is dangerous: from one load it reached docs.files at depth 8. A load
 *      REFERENCES a document, a customer, a driver -- it does not OWN them.
 *   3. Some money is not the load's to delete. It reached driver_finance.escrow_ledger, WORM with
 *      no purge arm in any version of this route, deliberately. Driver escrow is money held in
 *      TRUST FOR THE DRIVER; the movement happened and the money is held. Removing the record
 *      because the freight turned out to belong to another entity would misstate what the company
 *      owes the driver. Detached, never deleted.
 *   4. COMPOSITE foreign keys break naive discovery. load_charge_lines_load_same_company_fk is on
 *      (load_id, operating_company_id); taking conkey[1] picked operating_company_id, deleted
 *      nothing, and the charge line then blocked the parent. The child column is resolved by
 *      matching confkey to the PARENT's id column -- position, not guesswork.
 *
 * THE BOUNDARY: load-owned child -> recurse and DELETE. Shared hub or trust ledger -> DETACH
 * (NULL the reference, keep the row); if that column is NOT NULL, REFUSE and name it, because a
 * forced choice between destroying a shared record and corrupting a required link is the owner's.
 *
 * This decides ORDER and OWNERSHIP. The WORM trigger still decides PERMISSION on every DELETE.
 */
DECLARE
  r record; v_child uuid[]; v_sql text; v_n bigint; v_total bigint := 0; v_any boolean;
  HUBS text[] := ARRAY[
    'docs.files','docs.file_links','mdata.customers','mdata.vendors','mdata.drivers','mdata.units',
    'mdata.equipment','mdata.locations','identity.users','org.companies','catalogs.accounts','reference.states',
    'driver_finance.escrow_ledger','driver_finance.escrow_balances','driver_finance.escrow_deductions_pending',
    'driver_finance.driver_advances','driver_finance.driver_liabilities','driver_finance.signed_acknowledgments'
  ];
BEGIN
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL THEN RETURN 0; END IF;
  IF p_depth > 8 THEN
    RAISE EXCEPTION '_purge_rows_cascade: depth limit reached at %.% -- refusing rather than guessing', p_schema, p_table USING ERRCODE='restrict_violation';
  END IF;

  FOR r IN
    WITH parent AS (
      SELECT format('%I.%I', p_schema, p_table)::regclass AS oid,
             (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = format('%I.%I', p_schema, p_table)::regclass AND a.attname='id') AS idnum
    )
    SELECT n.nspname AS sch, cl.relname AS tbl, ca.attname AS col, ca.attnotnull AS notnull,
           EXISTS (SELECT 1 FROM pg_attribute ia WHERE ia.attrelid=cl.oid AND ia.attname='id' AND ia.attnum>0 AND NOT ia.attisdropped) AS has_id,
           EXISTS (SELECT 1 FROM pg_attribute ia WHERE ia.attrelid=cl.oid AND ia.attname='id' AND ia.attnum>0 AND NOT ia.attisdropped
                      AND ia.atttypid='uuid'::regtype) AS id_is_uuid
      FROM pg_constraint k
      CROSS JOIN parent pr
      JOIN pg_class cl ON cl.oid=k.conrelid
      JOIN pg_namespace n ON n.oid=cl.relnamespace
      JOIN LATERAL (
        SELECT k.conkey[i] AS child_attnum
          FROM generate_subscripts(k.confkey, 1) AS i
         WHERE k.confkey[i] = pr.idnum
         LIMIT 1
      ) m ON true
      JOIN pg_attribute ca ON ca.attrelid=k.conrelid AND ca.attnum=m.child_attnum
     WHERE k.contype='f' AND k.confrelid = pr.oid AND ca.atttypid='uuid'::regtype
     GROUP BY n.nspname, cl.relname, ca.attname, ca.attnotnull, cl.oid
     ORDER BY n.nspname, cl.relname, ca.attname
  LOOP
    IF r.sch = p_schema AND r.tbl = p_table THEN CONTINUE; END IF;
    IF (r.sch||'.'||r.tbl) = ANY (HUBS) THEN
      EXECUTE format('SELECT count(*) > 0 FROM %I.%I WHERE %I = ANY($1::uuid[])', r.sch, r.tbl, r.col) INTO v_any USING p_ids;
      IF v_any THEN
        IF r.notnull THEN
          RAISE EXCEPTION '_purge_rows_cascade: %.%.% is NOT NULL and references a row being purged. It is a shared or trust record this route never deletes and the link cannot be detached. Resolve it first.', r.sch, r.tbl, r.col USING ERRCODE='restrict_violation';
        END IF;
        EXECUTE format('UPDATE %I.%I SET %I = NULL WHERE %I = ANY($1::uuid[])', r.sch, r.tbl, r.col, r.col) USING p_ids;
      END IF;
      CONTINUE;
    END IF;
    IF r.has_id AND NOT r.id_is_uuid THEN
      -- LEAD 443.247 (fork, 10-22): a child whose id is an integer / bigint (e.g. an audit or detail table) cannot be
      -- collected into uuid[] — the cast refused the whole purge. Such a child cannot be a parent this cascade follows
      -- (only uuid FKs are walked), so it is deleted by its FK to the purged rows, each row recorded with its own id.
      v_sql := format('WITH d AS (DELETE FROM %I.%I WHERE %I = ANY($1::uuid[]) RETURNING *) INSERT INTO audit.record_deletions (operating_company_id, deletion_route, auth_id, table_name, row_pk, reason, row_data, deleted_by_user_id) SELECT $2::uuid, ''auth_purge'', $3::text, %L, to_jsonb(d.*) ->> ''id'', $4::text, to_jsonb(d.*), $5::uuid FROM d', r.sch, r.tbl, r.col, r.sch||'.'||r.tbl);
      EXECUTE v_sql USING p_ids, p_company, p_auth, p_reason, p_actor;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
    ELSIF r.has_id THEN
      EXECUTE format('SELECT array_agg(id) FROM %I.%I WHERE %I = ANY($1::uuid[])', r.sch, r.tbl, r.col) INTO v_child USING p_ids;
      IF v_child IS NOT NULL AND array_length(v_child,1) > 0 THEN
        v_total := v_total + accounting._purge_rows_cascade(r.sch, r.tbl, v_child, p_company, p_auth, p_actor, p_reason, p_depth+1);
      END IF;
    ELSE
      v_sql := format('WITH d AS (DELETE FROM %I.%I WHERE %I = ANY($1::uuid[]) RETURNING *) INSERT INTO audit.record_deletions (operating_company_id, deletion_route, auth_id, table_name, row_pk, reason, row_data, deleted_by_user_id) SELECT $2::uuid, ''auth_purge'', $3::text, %L, ''(no id)'', $4::text, to_jsonb(d.*), $5::uuid FROM d', r.sch, r.tbl, r.col, r.sch||'.'||r.tbl);
      EXECUTE v_sql USING p_ids, p_company, p_auth, p_reason, p_actor;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
    END IF;
  END LOOP;

  v_sql := format('WITH d AS (DELETE FROM %I.%I WHERE id = ANY($1::uuid[]) RETURNING *) INSERT INTO audit.record_deletions (operating_company_id, deletion_route, auth_id, table_name, row_pk, reason, row_data, deleted_by_user_id) SELECT $2::uuid, ''auth_purge'', $3::text, %L, to_jsonb(d.*) ->> ''id'', $4::text, to_jsonb(d.*), $5::uuid FROM d', p_schema, p_table, p_schema||'.'||p_table);
  EXECUTE v_sql USING p_ids, p_company, p_auth, p_reason, p_actor;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
  RETURN v_total;
END $fn$;
REVOKE ALL ON FUNCTION accounting._purge_rows_cascade(text, text, uuid[], uuid, text, uuid, text, integer) FROM PUBLIC;

COMMIT;
