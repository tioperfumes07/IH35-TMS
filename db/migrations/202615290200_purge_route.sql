-- 202615290200_purge_route.sql
-- CC-1 · Lead ROUND 331 / 334 step 1 — the PERMANENT DELETE ROUTE, packaged from the Lead's validation branch
-- br-late-grass-akgve11z (forked from prod br-fancy-credit-akjnd07a). The DDL below is the branch's own, read with
-- pg_get_functiondef / pg_dump -s; the differences from the branch are named in "HARDENED HERE".
--
-- SUPERSEDES the HELD 202615210200_complete_delete_route_and_inbound_entity.sql (moved to the `superseded` section of
-- .held-migrations.json in this PR, so the runner never auto-applies it on prod). Everything that file created is
-- created here too, idempotently, and its refuse_financial_row_delete() is replaced by the hardened one below.
--
-- OWNER LAW 2026-10-02: "TRANSPORTATION COMPLETE SETTLEMENTS IS A PERMANENT DELETE. I DO NOT WANT A RECORD OF THOSE
-- TRANSACTIONS IN MY APP." WORM stays the default for every role. The ways through it are narrow and each one names
-- the rows it may touch:
--   ARM M  merged customer / vendor duplicates (CC-3's canonical merge — unchanged from prod).
--   ARM C  cancelled-load revrec, only inside accounting.delete_cancelled_load_revrec (SECURITY DEFINER).
--   ARM L  rows the OWNER listed one by one for an AUTH-NNN in _system.purge_authorized_rows.
--   ARM X  a REAL load whose source names a different entity, listed for an AUTH, with no live financial document.
--   then the child / detail / voided-document / master-data arms, unchanged from prod.
--
-- ── THE LATENT FAULT THIS FIXES (to_regprocedure) ──────────────────────────────────────────────────────────────────
-- The held version's ARM C cast 'accounting.delete_cancelled_load_revrec(...)'::regprocedure. A ::regprocedure cast
-- THROWS when the function is absent, and that trigger function backs 80 tables (81 with audit.record_deletions):
-- a missing or dropped revrec function would have broken every DELETE in the database at once. ARM C now uses
-- to_regprocedure(), which returns NULL, so an absent function simply closes ARM C. The Lead found it because the
-- held migration was unapplied on the branch — exactly the condition that would have triggered it in production.
--
-- ── THE BOUNDARY (accounting._purge_rows_cascade) ──────────────────────────────────────────────────────────────────
-- Order is DISCOVERED from the FK graph at run time, never typed: mdata.loads has ~85 referencing FKs whose children
-- have children (accounting.expenses -> accounting.expense_lines). A load-owned child is recursed into and DELETED.
-- A shared hub or a trust ledger is DETACHED — the reference is NULLed and the row kept — never deleted:
--   * hubs (docs.files, customers, vendors, drivers, units, users, companies, accounts ...): a load REFERENCES a
--     document, a customer, a driver; it does not OWN them. Unbounded, one load reached docs.files at depth 8.
--   * driver_finance.escrow_ledger (and the other escrow / advance / liability / acknowledgment tables) is the
--     DRIVER'S MONEY, held in trust. The movement happened and the money is held; deleting it because the freight
--     belonged to another entity would misstate what the company owes the driver. Detached, never deleted.
--   * a hub column that is NOT NULL cannot be detached: the cascade REFUSES and names it — that choice is the owner's.
-- The child column is resolved by matching confkey to the PARENT's id column, never conkey[1]: the composite FK
-- dispatch.load_charge_lines (load_id, operating_company_id) made conkey[1] pick operating_company_id, delete
-- nothing, and leave the charge line blocking the parent (a typed list had already reported 0 rows where there was 1).
-- The cascade decides ORDER and OWNERSHIP. The WORM trigger still decides PERMISSION on every single DELETE.
--
-- ── HARDENED HERE (vs. the branch) ─────────────────────────────────────────────────────────────────────────────────
-- Prod's default privileges grant PUBLIC SELECT on new _system tables and PUBLIC INSERT/SELECT/UPDATE on new audit
-- tables; the branch inherited both. WORM refuses DELETE only, so PUBLIC UPDATE on the forensic deletion record would
-- let any role rewrite it, and PUBLIC SELECT would let every seat read the owner's authorization list. Revoked:
--   _system.purge_authorized_rows  SELECT to ih35_ci_readonly only (dry-run reads); nothing for PUBLIC / ih35_app.
--   audit.record_deletions         SELECT to ih35_app + ih35_ci_readonly; writes only via the SECURITY DEFINER routes.
--   purge_cross_entity_load / _purge_rows_cascade  EXECUTE revoked from PUBLIC — owner role only.
--
-- ── DATA ───────────────────────────────────────────────────────────────────────────────────────────────────────────
-- mdata.loads.source_entity_code backfilled 'TRANSP' for the 21 USMCA loads the owner's workbook marks IH (the same
-- 21 ids the Lead set on the branch, each verified present in USMCA on prod 2026-10-02). Only rows still NULL, only in
-- USMCA. Nothing is deleted by this migration; deletion needs an owner-listed AUTH-NNN at run time.
-- Additive, idempotent.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- ── 1. The owner's row-by-row authorization list ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _system.purge_authorized_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id text NOT NULL CHECK (auth_id ~ '^AUTH-[0-9]+$'),
  table_name text NOT NULL,
  row_pk text NOT NULL,
  reason text NOT NULL,
  listed_at timestamptz NOT NULL DEFAULT now(),
  listed_by text NOT NULL DEFAULT current_user
);
CREATE UNIQUE INDEX IF NOT EXISTS purge_authorized_rows_uq ON _system.purge_authorized_rows (auth_id, table_name, row_pk);
REVOKE ALL ON _system.purge_authorized_rows FROM PUBLIC;
REVOKE ALL ON _system.purge_authorized_rows FROM ih35_app;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_ci_readonly') THEN
    GRANT SELECT ON _system.purge_authorized_rows TO ih35_ci_readonly;
  END IF;
END $$;

-- ── 2. The forensic deletion record (WORM, company-isolated) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit.record_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid,
  deletion_route text NOT NULL CHECK (deletion_route IN ('auth_purge', 'cancelled_load_revrec')),
  auth_id text,
  table_name text NOT NULL,
  row_pk text NOT NULL,
  reason text NOT NULL,
  row_data jsonb NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by_user_id uuid,
  deleted_by_role text NOT NULL DEFAULT current_user
);
CREATE INDEX IF NOT EXISTS record_deletions_company_idx ON audit.record_deletions (operating_company_id, deleted_at);
CREATE INDEX IF NOT EXISTS record_deletions_row_idx ON audit.record_deletions (table_name, row_pk);
ALTER TABLE audit.record_deletions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.record_deletions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS record_deletions_company_isolation ON audit.record_deletions;
CREATE POLICY record_deletions_company_isolation ON audit.record_deletions
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
REVOKE ALL ON audit.record_deletions FROM PUBLIC;
REVOKE ALL ON audit.record_deletions FROM ih35_app;
GRANT SELECT ON audit.record_deletions TO ih35_app;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_ci_readonly') THEN
    GRANT SELECT ON audit.record_deletions TO ih35_ci_readonly;
  END IF;
END $$;

-- ── 3. The inbound source's entity on the load ───────────────────────────────────────────────────────────────────
ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS source_entity_code text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loads_source_entity_code_chk' AND conrelid = 'mdata.loads'::regclass) THEN
    ALTER TABLE mdata.loads ADD CONSTRAINT loads_source_entity_code_chk CHECK (source_entity_code IS NULL OR source_entity_code IN ('TRANSP', 'TRK', 'USMCA')) NOT VALID;
  END IF;
END $$;
COMMENT ON COLUMN mdata.loads.source_entity_code IS 'ROUND 326/331: the operating company the inbound source (AlwaysTrack / Faro) names for this load. When it differs from operating_company_id the load is cross-entity: surfaced by verify-no-cross-entity-loads and deletable only through ARM X of accounting.refuse_financial_row_delete.';

-- ── 4. The WORM adjudicator (ARM C now via to_regprocedure; ARM X added) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION accounting.refuse_financial_row_delete()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  v_auth_id text;
  v_table   text;
  v_row     jsonb;
  v_load    text;
  v_je      uuid;
  v_own     text;
  v_proc    oid;
BEGIN
  v_auth_id := NULLIF(current_setting('app.purge_auth_id', true), '');
  v_table   := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
  v_row     := to_jsonb(OLD);

  -- ARM M (ROUND 288.3 / 296 — CC-3's canonical merge, migration 202615221000): a customer / vendor DUPLICATE that the
  -- canonical merge engine merged (a live, same-company alias names it) may be deleted.
  IF v_table = 'mdata.customers' AND EXISTS (
       SELECT 1 FROM mdata.customer_aliases a
        WHERE a.merged_customer_id = (v_row ->> 'id')::uuid
          AND a.operating_company_id = (v_row ->> 'operating_company_id')::uuid
          AND a.reversed_at IS NULL) THEN
    RETURN OLD;
  END IF;
  IF v_table = 'mdata.vendors' AND EXISTS (
       SELECT 1 FROM mdata.vendor_aliases a
        WHERE a.merged_vendor_id = (v_row ->> 'id')::uuid
          AND a.operating_company_id = (v_row ->> 'operating_company_id')::uuid
          AND a.reversed_at IS NULL) THEN
    RETURN OLD;
  END IF;

  -- ARM C (ROUND 326) — cancelled-load revrec: only inside accounting.delete_cancelled_load_revrec (it runs as the
  -- function owner and sets app.revrec_cancel_load_id), only for that load's revrec JEs and their reversals.
  -- to_regprocedure, NOT ::regprocedure: the cast THROWS when the function is absent, and this trigger backs every
  -- WORM table — an absent function must close ARM C, never break every DELETE in the database.
  v_load := NULLIF(current_setting('app.revrec_cancel_load_id', true), '');
  v_proc := to_regprocedure('accounting.delete_cancelled_load_revrec(uuid,uuid,uuid,text)');
  IF v_load IS NOT NULL AND v_proc IS NOT NULL
     AND current_user = (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid = v_proc)
     AND v_table = ANY (ARRAY['accounting.journal_entries', 'accounting.journal_entry_postings']) THEN
    v_je := CASE WHEN v_table = 'accounting.journal_entries' THEN (v_row ->> 'id')::uuid ELSE (v_row ->> 'journal_entry_uuid')::uuid END;
    IF EXISTS (
      SELECT 1 FROM accounting.journal_entries j
       LEFT JOIN accounting.journal_entries o ON o.id = j.reverses_je_id
       WHERE j.id = v_je
         AND (j.memo LIKE 'Revrec Event %[' || v_load || ']%' OR o.memo LIKE 'Revrec Event %[' || v_load || ']%')
    ) OR v_table = 'accounting.journal_entry_postings' AND NOT EXISTS (SELECT 1 FROM accounting.journal_entries j WHERE j.id = v_je) THEN
      RETURN OLD;
    END IF;
  END IF;

  IF v_auth_id ~ '^AUTH-[0-9]+$' THEN

    -- ARM L (ROUND 326) — rows the owner listed for THIS AUTH, one by one (a line goes with its listed parent).
    IF EXISTS (SELECT 1 FROM _system.purge_authorized_rows r WHERE r.auth_id = v_auth_id AND r.table_name = v_table AND r.row_pk = COALESCE(v_row ->> 'id', v_row ->> 'uuid'))
       OR (v_table = 'accounting.journal_entry_postings' AND (
             EXISTS (SELECT 1 FROM _system.purge_authorized_rows r WHERE r.auth_id = v_auth_id AND r.table_name = 'accounting.journal_entries' AND r.row_pk = v_row ->> 'journal_entry_uuid')
             OR NOT EXISTS (SELECT 1 FROM accounting.journal_entries j WHERE j.id = (v_row ->> 'journal_entry_uuid')::uuid)))
       OR (v_table = 'accounting.invoice_lines' AND EXISTS (SELECT 1 FROM _system.purge_authorized_rows r WHERE r.auth_id = v_auth_id AND r.table_name = 'accounting.invoices' AND r.row_pk = v_row ->> 'invoice_id')) THEN
      RETURN OLD;
    END IF;

    -- ARM X (ROUND 331) — a REAL load whose SOURCE names a different entity, listed for this AUTH, with no live
    -- financial document. See accounting.purge_cross_entity_load.
    IF v_table = 'mdata.loads'
       AND EXISTS (SELECT 1 FROM _system.purge_authorized_rows r WHERE r.auth_id = v_auth_id AND r.table_name = 'mdata.loads' AND r.row_pk = v_row ->> 'id')
       AND NULLIF(v_row ->> 'source_entity_code', '') IS NOT NULL THEN
      SELECT c.code INTO v_own FROM org.companies c WHERE c.id = (v_row ->> 'operating_company_id')::uuid;
      IF (v_row ->> 'source_entity_code') IS DISTINCT FROM v_own THEN
        IF EXISTS (SELECT 1 FROM accounting.invoices i WHERE i.source_load_id = (v_row ->> 'id')::uuid AND i.voided_at IS NULL)
           OR EXISTS (SELECT 1 FROM accounting.expenses e WHERE e.load_id = (v_row ->> 'id')::uuid AND e.voided_at IS NULL)
           OR EXISTS (SELECT 1 FROM accounting.bills b WHERE b.load_id = (v_row ->> 'id')::uuid AND b.voided_at IS NULL)
           OR EXISTS (SELECT 1 FROM driver_finance.driver_bills d WHERE d.load_id = (v_row ->> 'id')::uuid AND d.voided_at IS NULL)
           OR EXISTS (SELECT 1 FROM driver_finance.settlement_lines s WHERE s.load_id = (v_row ->> 'id')::uuid AND s.voided_at IS NULL) THEN
          RAISE EXCEPTION
            'mdata.loads row % is a cross-entity load (source %, company %) but still carries a LIVE financial document -- void it through its own engine first. Auth % never deletes a load out from under live money.',
            v_row ->> 'id', v_row ->> 'source_entity_code', v_own, v_auth_id
            USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
      END IF;
    END IF;

    -- ARM 0 — TRUE CHILD: deletable only when its OWN PARENT DOCUMENT is voided. Checked before the detail arm so a
    -- table listed here can never fall through to a weaker arm.
    IF v_table = ANY (ARRAY['accounting.invoice_lines', 'accounting.payment_applications']) THEN
      IF NOT accounting.parent_document_is_voided(v_table, v_row) THEN
        RAISE EXCEPTION
          '%.% row % belongs to a LIVE parent document -- the purge bypass (auth %) never deletes a child out from under a live document, no exceptions, regardless of role.',
          TG_TABLE_SCHEMA, TG_TABLE_NAME, COALESCE(v_row ->> 'id', '?'), v_auth_id
          USING ERRCODE = 'restrict_violation';
      END IF;
      RETURN OLD;
    END IF;

    IF v_table = ANY (ARRAY[
      'accounting.journal_entry_postings',
      'accounting.expense_lines',
      'accounting.factoring_reserve_movements',
      'accounting.factoring_default_interest_accruals',
      'accounting.factoring_lifecycle_posting_keys',
      'accounting.transaction_source_links',
      'accounting.expenses_review_queue',
      'accounting.credit_memo_applications',
      'accounting.company_settlement_driver_settlements',
      'accounting.bill_unit_allocation',
      'driver_finance.settlement_line_item_splits',
      'driver_finance.team_settlement_splits',
      'driver_finance.driver_settlement_gl_bills',
      'driver_finance.settlement_payment_events',
      'driver_finance.deduction_recovery_links',
      'driver_finance.driver_deduction_bucket_events',
      'banking.check_print_batch_items',
      'factoring.reserve_movement'
    ]) THEN
      RETURN OLD;
    END IF;

    IF v_table = ANY (ARRAY[
      'accounting.expenses', 'accounting.bills', 'accounting.bill_lines', 'accounting.bill_payments',
      'accounting.invoices', 'accounting.payments', 'accounting.credit_memos',
      'accounting.vendor_credits', 'accounting.factoring_advances', 'accounting.journal_entries',
      'accounting.broker_advances', 'accounting.company_settlements',
      'banking.bank_transactions', 'banking.bank_transaction_splits',
      'banking.reconciliation_matches', 'banking.reconciliation_sessions',
      'banking.check_number_registry', 'banking.transfers',
      'driver_finance.settlement_lines', 'driver_finance.driver_settlements',
      'driver_finance.driver_settlement_deductions', 'driver_finance.driver_bills',
      'driver_finance.driver_liabilities', 'driver_finance.driver_advances',
      'driver_finance.driver_reimbursements', 'driver_finance.driver_escrow_separations',
      'driver_finance.signed_acknowledgments',
      'factoring.letter_of_release', 'factoring.batch'
    ]) THEN
      IF (v_row ->> 'voided_at') IS NULL AND (v_row ->> 'revoked_at') IS NULL THEN
        RAISE EXCEPTION
          '%.% row % is NOT voided -- the purge bypass (auth %) never applies to a live document, no exceptions, regardless of role.',
          TG_TABLE_SCHEMA, TG_TABLE_NAME, COALESCE(v_row ->> 'id', v_row ->> 'uuid', '?'), v_auth_id
          USING ERRCODE = 'restrict_violation';
      END IF;
      RETURN OLD;
    END IF;

    IF v_table = ANY (ARRAY[
      'mdata.customers', 'mdata.vendors', 'mdata.drivers', 'mdata.units',
      'mdata.equipment', 'mdata.loads', 'mdata.locations'
    ]) THEN
      IF (v_row ->> 'is_sample_data') IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION
          '%.% row % is NOT sample data and is not an authorized cross-entity load -- the purge bypass (auth %) never applies to a real master-data record, no exceptions, regardless of role.',
          TG_TABLE_SCHEMA, TG_TABLE_NAME, COALESCE(v_row ->> 'id', v_row ->> 'uuid', '?'), v_auth_id
          USING ERRCODE = 'restrict_violation';
      END IF;
      RETURN OLD;
    END IF;

  END IF;

  RAISE EXCEPTION
    '%.% is WORM: DELETE is refused for every role. Financial rows are never deleted -- void or reverse the document instead, or set app.purge_auth_id to an OPEN AUTH-NNN for an explicitly authorized voided-row purge.',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $fn$;

DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON audit.record_deletions;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON audit.record_deletions
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();

-- ── 5. The runtime cancel path's complete delete of ONE cancelled load's revenue recognition ─────────────────────
-- The latch rows, their JEs (+ reversals) and lines, and the JE source links — each recorded in audit.record_deletions
-- first. Refuses unless the load exists in the company and is cancelled; a closed period still refuses. The deferred
-- balance check holds because whole JEs go. Returns the JEs deleted.
CREATE OR REPLACE FUNCTION accounting.delete_cancelled_load_revrec(p_company uuid, p_load uuid, p_actor uuid, p_reason text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE
  v_jes uuid[];
  v_n integer;
BEGIN
  -- FORCE RLS binds the owner too: pin the company scope here rather than trusting the caller's session.
  PERFORM set_config('app.operating_company_id', p_company::text, true);
  IF NOT EXISTS (SELECT 1 FROM mdata.loads l WHERE l.id = p_load AND l.operating_company_id = p_company AND l.status::text = 'cancelled') THEN
    RAISE EXCEPTION 'delete_cancelled_load_revrec: load % is not a cancelled load of company %', p_load, p_company USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT array_agg(DISTINCT x) INTO v_jes FROM (
    SELECT r.journal_entry_id AS x FROM accounting.load_revenue_recognition_postings r WHERE r.load_id = p_load AND r.operating_company_id = p_company
    UNION SELECT j.reversed_by_je_id FROM accounting.journal_entries j
      JOIN accounting.load_revenue_recognition_postings r ON r.journal_entry_id = j.id AND r.load_id = p_load AND r.operating_company_id = p_company
     WHERE j.reversed_by_je_id IS NOT NULL
    UNION SELECT j.id FROM accounting.journal_entries j
      JOIN accounting.load_revenue_recognition_postings r ON r.journal_entry_id = j.reverses_je_id AND r.load_id = p_load AND r.operating_company_id = p_company
  ) s WHERE x IS NOT NULL;
  INSERT INTO audit.record_deletions (operating_company_id, deletion_route, table_name, row_pk, reason, row_data, deleted_by_user_id)
  SELECT p_company, 'cancelled_load_revrec', 'accounting.load_revenue_recognition_postings', r.id::text, p_reason, to_jsonb(r), p_actor
    FROM accounting.load_revenue_recognition_postings r WHERE r.load_id = p_load AND r.operating_company_id = p_company;
  IF v_jes IS NULL THEN
    DELETE FROM accounting.load_revenue_recognition_postings WHERE load_id = p_load AND operating_company_id = p_company;
    RETURN 0;
  END IF;
  -- Lines removed by the JE cascade can no longer see their entry date, so the closed-period rule is checked here,
  -- per JE, before anything is deleted.
  PERFORM accounting.raise_if_txn_in_closed_period(p_company, j.entry_date) FROM accounting.journal_entries j WHERE j.id = ANY (v_jes);
  INSERT INTO audit.record_deletions (operating_company_id, deletion_route, table_name, row_pk, reason, row_data, deleted_by_user_id)
  SELECT p_company, 'cancelled_load_revrec', 'accounting.journal_entries', j.id::text, p_reason,
         to_jsonb(j) || jsonb_build_object('postings', (SELECT jsonb_agg(to_jsonb(p)) FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = j.id)), p_actor
    FROM accounting.journal_entries j WHERE j.id = ANY (v_jes);
  PERFORM set_config('app.revrec_cancel_load_id', p_load::text, true);
  DELETE FROM accounting.transaction_source_links t USING accounting.journal_entry_postings p
   WHERE t.journal_entry_posting_id = p.id AND p.journal_entry_uuid = ANY (v_jes)
     AND t.operating_company_id = p_company AND p.operating_company_id = p_company;
  DELETE FROM accounting.load_revenue_recognition_postings WHERE load_id = p_load AND operating_company_id = p_company;
  -- One statement: an original and its reversal go together, so the self-FKs (NO ACTION) hold at statement end.
  DELETE FROM accounting.journal_entries WHERE id = ANY (v_jes) AND operating_company_id = p_company;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM set_config('app.revrec_cancel_load_id', '', true);
  RETURN v_n;
END $fn$;
REVOKE ALL ON FUNCTION accounting.delete_cancelled_load_revrec(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accounting.delete_cancelled_load_revrec(uuid, uuid, uuid, text) TO ih35_app;

-- ── 6. Recursive, FK-discovered deletion with a DECLARED boundary ────────────────────────────────────────────────
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
           EXISTS (SELECT 1 FROM pg_attribute ia WHERE ia.attrelid=cl.oid AND ia.attname='id' AND ia.attnum>0 AND NOT ia.attisdropped) AS has_id
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
    IF r.has_id THEN
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

-- ── 7. The permanent delete of a cross-entity load ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION accounting.purge_cross_entity_load(p_company uuid, p_load uuid, p_auth text, p_actor uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
/*
 * ROUND 331 — PERMANENT DELETE OF A CROSS-ENTITY LOAD AND EVERYTHING HANGING OFF IT.
 * OWNER LAW 2026-10-02: "TRANSPORTATION COMPLETE SETTLEMENTS IS A PERMANENT DELETE. I DO NOT
 * WANT A RECORD OF THOSE TRANSACTIONS IN MY APP."
 *
 * Order comes from accounting._purge_rows_cascade, which reads the FK graph at run time.
 * Permission comes from the WORM trigger (ARM X), which adjudicates every single DELETE.
 * Refuses, before touching anything: load not in company · not cross-entity · not listed for an
 * open AUTH-NNN · any LIVE financial document still attached.
 */
DECLARE
  v_own text; v_src text; v_total bigint;
BEGIN
  IF p_auth IS NULL OR p_auth !~ '^AUTH-[0-9]+$' THEN
    RAISE EXCEPTION 'purge_cross_entity_load: p_auth must be AUTH-NNN, got %', p_auth USING ERRCODE='restrict_violation';
  END IF;
  SELECT c.code, l.source_entity_code INTO v_own, v_src
    FROM mdata.loads l JOIN org.companies c ON c.id=l.operating_company_id
   WHERE l.id=p_load AND l.operating_company_id=p_company;
  IF v_own IS NULL THEN
    RAISE EXCEPTION 'purge_cross_entity_load: load % is not a load of company %', p_load, p_company USING ERRCODE='restrict_violation';
  END IF;
  IF v_src IS NULL OR v_src = v_own THEN
    RAISE EXCEPTION 'purge_cross_entity_load: load % is NOT cross-entity (source %, company %). This route only ever removes freight belonging to another entity.', p_load, COALESCE(v_src,'<null>'), v_own USING ERRCODE='restrict_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM _system.purge_authorized_rows r WHERE r.auth_id=p_auth AND r.table_name='mdata.loads' AND r.row_pk=p_load::text) THEN
    RAISE EXCEPTION 'purge_cross_entity_load: load % is not listed for % in _system.purge_authorized_rows. The owner lists each row; no service can.', p_load, p_auth USING ERRCODE='restrict_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM accounting.invoices i WHERE i.source_load_id=p_load AND i.voided_at IS NULL)
     OR EXISTS (SELECT 1 FROM accounting.expenses e WHERE e.load_id=p_load AND e.voided_at IS NULL)
     OR EXISTS (SELECT 1 FROM accounting.bills b WHERE b.load_id=p_load AND b.voided_at IS NULL)
     OR EXISTS (SELECT 1 FROM driver_finance.driver_bills d WHERE d.load_id=p_load AND d.voided_at IS NULL)
     OR EXISTS (SELECT 1 FROM driver_finance.settlement_lines s WHERE s.load_id=p_load AND s.voided_at IS NULL) THEN
    RAISE EXCEPTION 'purge_cross_entity_load: load % still carries a LIVE financial document. Void the invoice / expense / bill / driver bill / settlement line through its own engine first.', p_load USING ERRCODE='restrict_violation';
  END IF;

  PERFORM set_config('app.operating_company_id', p_company::text, true);
  PERFORM set_config('app.purge_auth_id', p_auth, true);
  v_total := accounting._purge_rows_cascade('mdata','loads', ARRAY[p_load], p_company, p_auth, p_actor, p_reason, 0);
  IF EXISTS (SELECT 1 FROM mdata.loads WHERE id=p_load) THEN
    RAISE EXCEPTION 'purge_cross_entity_load: load % survived the cascade', p_load USING ERRCODE='restrict_violation';
  END IF;
  PERFORM set_config('app.purge_auth_id','',true);
  RETURN jsonb_build_object('load_id',p_load,'source_entity_code',v_src,'company_code',v_own,'rows_deleted',v_total);
END $fn$;
REVOKE ALL ON FUNCTION accounting.purge_cross_entity_load(uuid, uuid, text, uuid, text) FROM PUBLIC;

-- ── 8. Backfill: the 21 USMCA loads the owner's workbook marks IH (TRANSP freight) ───────────────────────────────
-- Fresh / CI databases carry none of these ids, so this is a no-op there.
UPDATE mdata.loads l
   SET source_entity_code = 'TRANSP'
  FROM org.companies c
 WHERE c.id = l.operating_company_id
   AND c.code = 'USMCA'
   AND l.source_entity_code IS NULL
   AND l.id IN (
     'fd9d641c-dc93-4458-be4c-54b4413a1f7c', -- 13485
     '8da7447b-dc70-40eb-96f4-25e579a50dc5', -- 13493
     'a1f7c498-a438-4fb2-a8e1-9bf7304428a4', -- 13494
     '580f4e35-1b11-4be2-bc87-62ce3530ca3b', -- 13496
     '6334aee8-d19f-4028-a2b0-4170ff282442', -- 13497
     'a5ac0a30-e139-4ca5-ab76-af248010cff9', -- 13500
     '6cfa9455-9979-4719-b614-7a7b02b66843', -- 13502
     '2c2d9ae7-386d-4ede-9c8f-888bce2896d7', -- 13503
     '951e3250-b958-4f1c-9ee1-bcb0f866442e', -- 13504
     'c680f31a-ab3f-437e-a6ac-be2ed91b1791', -- 13505
     '418a3c89-02c6-4732-9860-4eba6e24bbdc', -- 13506
     'ab24126b-9365-4cec-bb10-3dffc535cdfd', -- 13507
     '65f63b50-7bb5-443b-95bf-dc0101ae84db', -- 13508
     'c516a904-fdb7-4a85-8626-ef1fba5c0151', -- 13509
     '72d1788a-b5a1-44ab-bfd9-099fab769e85', -- 13510
     '0096a14d-141e-4662-87cc-69d4cfd3997d', -- 13511
     '7ace8319-6b54-4c78-aa9c-621e0df1f648', -- 13522
     'dc924be1-dd13-4ab1-84c4-4b39cbe84bd6', -- 13530
     '4d8935e5-87c9-4a04-9044-539d7898c235', -- 13531
     '2bd904b9-e67c-4a29-a8b0-957d6dd2306f', -- 13533
     '1968693e-1d9b-48c3-b5e7-8d914df426bc'  -- 13539
   );

-- ── 9. Self-check: the hardening is what landed ──────────────────────────────────────────────────────────────────
DO $$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('accounting.refuse_financial_row_delete()'::regprocedure);
  IF v_def LIKE '%''accounting.delete_cancelled_load_revrec(uuid,uuid,uuid,text)''::regprocedure%' OR v_def NOT LIKE '%to_regprocedure(%' THEN
    RAISE EXCEPTION '202615290200: refuse_financial_row_delete still casts ::regprocedure — the hardening did not land';
  END IF;
  IF to_regprocedure('accounting.purge_cross_entity_load(uuid,uuid,text,uuid,text)') IS NULL
     OR to_regprocedure('accounting._purge_rows_cascade(text,text,uuid[],uuid,text,uuid,text,integer)') IS NULL
     OR to_regprocedure('accounting.delete_cancelled_load_revrec(uuid,uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION '202615290200: a purge-route function is missing';
  END IF;
  IF has_table_privilege('public', 'audit.record_deletions', 'UPDATE') OR has_table_privilege('public', '_system.purge_authorized_rows', 'SELECT') THEN
    RAISE EXCEPTION '202615290200: PUBLIC still holds a privilege on the purge route tables';
  END IF;
END $$;
COMMIT;
