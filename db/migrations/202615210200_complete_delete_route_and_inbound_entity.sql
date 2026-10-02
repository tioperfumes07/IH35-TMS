-- 202615210200_complete_delete_route_and_inbound_entity.sql
-- HELD — DO NOT RUN ON PROD until the Lead validates it on a Neon branch and applies it (CC-1 could not validate:
-- Neon write MCP 401 and local Postgres denied on 2026-10-02). Registered in db/migrations/.held-migrations.json
-- (verify:hold-migrations-registered). Fresh / CI databases apply it normally.
--
-- ROUND 326 (CC-1) — OWNER LAW 2026-10-02 "COMPLETE DELETE ROUTE" (supersedes void-not-delete): a record that should
-- never have existed is DELETED with its postings — no reversal pair left behind — and the ledger still balances.
-- WORM stays the default for every role; this adds exactly two narrow ways through it:
--   ARM L — LISTED ROWS: with app.purge_auth_id = an OPEN AUTH-NNN, a row is deletable only if THAT row is listed for
--           THAT AUTH in _system.purge_authorized_rows (owner-role only — ih35_app has no grant on it). A posting /
--           invoice line is deletable when its parent JE / invoice is listed. No blanket unlock.
--   ARM C — CANCELLED-LOAD REVREC (runtime cancel path): only inside accounting.delete_cancelled_load_revrec
--           (SECURITY DEFINER), only for the revenue-recognition JEs (and their reversals) of the one cancelled load
--           it was called for. Direct DELETEs by the app role never pass.
--   audit.record_deletions: every deleted row — what it was (full row) and why — before it goes. WORM.
--   mdata.loads.source_entity_code: the operating company an inbound load's SOURCE names (AlwaysTrack / Faro);
--           the importer resolves it or rejects — never a default, never the session company.
-- Additive, idempotent.
BEGIN;
SET LOCAL lock_timeout = '5s';

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
REVOKE ALL ON _system.purge_authorized_rows FROM ih35_app;

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
GRANT SELECT ON audit.record_deletions TO ih35_app;
DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON audit.record_deletions;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON audit.record_deletions
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();

ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS source_entity_code text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loads_source_entity_code_chk' AND conrelid = 'mdata.loads'::regclass) THEN
    ALTER TABLE mdata.loads ADD CONSTRAINT loads_source_entity_code_chk CHECK (source_entity_code IS NULL OR source_entity_code IN ('TRANSP', 'TRK', 'USMCA')) NOT VALID;
  END IF;
END $$;
COMMENT ON COLUMN mdata.loads.source_entity_code IS 'ROUND 326: the company the inbound source (AlwaysTrack / Faro) names for this load; must equal the load''s operating company (guard verify-no-cross-entity-loads).';

CREATE OR REPLACE FUNCTION accounting.refuse_financial_row_delete()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  v_auth_id text;
  v_table   text;
  v_row     jsonb;
  v_load    text;
  v_je      uuid;
BEGIN
  v_auth_id := NULLIF(current_setting('app.purge_auth_id', true), '');
  v_table   := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
  v_row     := to_jsonb(OLD);

  -- ARM M (ROUND 288.3 / 296 — CC-3's canonical merge, migration 202615221000): a customer / vendor DUPLICATE that the
  -- canonical merge engine merged (a live, same-company alias names it) may be deleted — the same narrow allowance
  -- CC-3's RLS policy grants. Nothing else in master data is deletable here.
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

  -- ARM C (ROUND 326) — cancelled-load revrec, runtime: only inside accounting.delete_cancelled_load_revrec (it runs
  -- as the function owner and sets app.revrec_cancel_load_id), only for that load's revrec JEs and their reversals.
  v_load := NULLIF(current_setting('app.revrec_cancel_load_id', true), '');
  IF v_load IS NOT NULL
     AND current_user = (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid = 'accounting.delete_cancelled_load_revrec(uuid,uuid,uuid,text)'::regprocedure)
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

    -- ARM 0 — TRUE CHILD: deletable only when its OWN PARENT DOCUMENT is voided. Stricter than the
    -- detail arm below, which asks nothing about the parent. Checked FIRST so a table listed here
    -- can never fall through to a weaker arm.
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
          '%.% row % is NOT sample data -- the purge bypass (auth %) never applies to a real master-data record, no exceptions, regardless of role.',
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

-- The runtime cancel path's complete delete of ONE cancelled load's revenue recognition (owner law 2026-10-02):
-- the latch rows, their JEs (+ reversals) and lines, and the JE source links — each recorded in audit.record_deletions
-- first. Refuses unless the load exists in the company and is cancelled; a closed period still refuses (posting
-- trigger). The deferred balance check holds because whole JEs go. Returns the JEs deleted.
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
COMMIT;
