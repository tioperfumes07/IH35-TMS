-- 202615300100_load_invoiced_follows_invoice.sql
-- CC-1 · Lead ROUND 332 item 3 / ROUND 334 step 4 — a load's 'invoiced' status follows its invoice, in the database.
--
-- MEASURED ON PROD 2026-10-02 (read-only): exactly 3 loads sit at status='invoiced' with NO live issued invoice —
-- 13503, 13504, 13539 (USMCA). Their invoices were created and sent 09-24, voided 09-25, the loads were bulk-set to
-- 'invoiced' on 09-28 14:26 (loads-bulk route), and the invoices purged 09-30. Each load held
-- 'completed_docs_received' immediately before (audit.row_changes). A/R said nothing was owed; the board said billed.
--
-- ROOT CAUSE: 18 backend files write mdata.loads.status, and only ONE path (POST /invoices/:id/void, ACCT-F13579)
-- reverted the load when its invoice died. voidDocument('invoice'), bulk-void, the purge route and the bulk status
-- route all left — or set — a load at 'invoiced' with no invoice behind it. A rule enforced in one of 18 writers is
-- not a rule. Both halves now live in the database, so every writer obeys them:
--
--   (a) trg_load_invoiced_requires_live_invoice — DEFERRABLE INITIALLY DEFERRED constraint trigger on mdata.loads:
--       at COMMIT, a load at 'invoiced' must have a live issued invoice (voided_at IS NULL, status sent / partial /
--       paid) linked by accounting.invoices.source_load_id or an accounting.invoice_lines.source_load_id. Deferred, so
--       the order of writes inside the transaction (invoice first or load first) never matters — only the committed
--       state does. Otherwise the transaction is refused, naming the load.
--   (b) trg_invoice_death_reverts_load — AFTER UPDATE OF voided_at, status, source_load_id / AFTER DELETE on
--       accounting.invoices: when an invoice stops being live, each load it billed that is at 'invoiced' and has no
--       OTHER live issued invoice reverts to the status it held immediately before 'invoiced' (audit.row_changes —
--       never a guess), never to paid / closed / cancelled (owner ruling, ACCT-F13579), default 'delivered'.
--       Same rule as the TS void route, which now finds the load already reverted and skips.
--
-- DATA: the 3 loads revert under rule (b) in this migration (one statement, same rule, audited by trg_audit_loads).
-- Additive, idempotent. Rehearsed on a Neon fork (see commit REHEARSED line).
BEGIN;
SET LOCAL lock_timeout = '5s';
-- FORCE RLS binds the migration role too: the data step must see every company's loads and their history.
SELECT set_config('app.bypass_rls', 'lucia', true);

-- Shared: does this load have a live issued invoice?
CREATE OR REPLACE FUNCTION accounting.load_has_live_issued_invoice(p_load uuid, p_company uuid, p_except_invoice uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM accounting.invoices i
     WHERE i.operating_company_id = p_company
       AND i.voided_at IS NULL
       AND i.status::text IN ('sent', 'partial', 'paid')
       AND (p_except_invoice IS NULL OR i.id <> p_except_invoice)
       AND (i.source_load_id = p_load
            OR EXISTS (SELECT 1 FROM accounting.invoice_lines il WHERE il.invoice_id = i.id AND il.source_load_id = p_load))
  );
$fn$;

-- Shared: the status a load held immediately before it became 'invoiced' (never paid / closed / cancelled).
CREATE OR REPLACE FUNCTION accounting.load_status_before_invoiced(p_load uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $fn$
  SELECT COALESCE(
    (SELECT CASE WHEN h.old_status IN ('paid', 'closed', 'cancelled', 'invoiced') OR h.old_status IS NULL THEN NULL ELSE h.old_status END
       FROM (SELECT rc.old_data ->> 'status' AS old_status
               FROM audit.row_changes rc
              WHERE rc.schema_name = 'mdata' AND rc.table_name = 'loads' AND rc.row_pk = p_load::text
                AND rc.new_data ->> 'status' = 'invoiced'
                AND (rc.old_data ->> 'status') IS DISTINCT FROM 'invoiced'
              ORDER BY rc.changed_at DESC
              LIMIT 1) h),
    'delivered');
$fn$;

-- (a) a load may sit at 'invoiced' only with a live issued invoice — checked at COMMIT.
CREATE OR REPLACE FUNCTION mdata.refuse_load_invoiced_without_live_invoice()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
DECLARE v_status text; v_number text;
BEGIN
  -- Deferred: re-read the committed-to-be state, not NEW (the row may have moved on since this event).
  SELECT l.status::text, l.load_number::text INTO v_status, v_number
    FROM mdata.loads l WHERE l.id = NEW.id;
  IF v_status = 'invoiced' AND NOT accounting.load_has_live_issued_invoice(NEW.id, NEW.operating_company_id) THEN
    RAISE EXCEPTION 'load % (%) cannot be ''invoiced'': it has no live issued invoice (sent / partial / paid). Issue the invoice in the same transaction, or leave the load at its delivery status.', v_number, NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS trg_load_invoiced_requires_live_invoice ON mdata.loads;
CREATE CONSTRAINT TRIGGER trg_load_invoiced_requires_live_invoice
  AFTER INSERT OR UPDATE OF status ON mdata.loads
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (NEW.status::text = 'invoiced')
  EXECUTE FUNCTION mdata.refuse_load_invoiced_without_live_invoice();

-- (b) an invoice that stops being live reverts the load(s) it billed.
CREATE OR REPLACE FUNCTION accounting.revert_load_on_invoice_death()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
DECLARE v_old_live boolean; v_new_live boolean; v_load uuid; v_company uuid; v_inv uuid;
BEGIN
  v_old_live := OLD.voided_at IS NULL AND OLD.status::text IN ('sent', 'partial', 'paid');
  IF TG_OP = 'DELETE' THEN
    v_new_live := false;
  ELSE
    v_new_live := NEW.voided_at IS NULL AND NEW.status::text IN ('sent', 'partial', 'paid') AND NEW.source_load_id IS NOT DISTINCT FROM OLD.source_load_id;
  END IF;
  IF NOT v_old_live OR v_new_live THEN
    RETURN NULL;
  END IF;
  v_company := OLD.operating_company_id;
  v_inv := OLD.id;
  FOR v_load IN
    SELECT OLD.source_load_id WHERE OLD.source_load_id IS NOT NULL
    UNION
    SELECT il.source_load_id FROM accounting.invoice_lines il WHERE il.invoice_id = OLD.id AND il.source_load_id IS NOT NULL
  LOOP
    IF NOT accounting.load_has_live_issued_invoice(v_load, v_company, v_inv) THEN
      UPDATE mdata.loads l
         SET status = accounting.load_status_before_invoiced(l.id)::mdata.load_status_enum,
             updated_at = now()
       WHERE l.id = v_load AND l.operating_company_id = v_company AND l.status::text = 'invoiced';
    END IF;
  END LOOP;
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS trg_invoice_death_reverts_load ON accounting.invoices;
CREATE TRIGGER trg_invoice_death_reverts_load
  AFTER UPDATE OF voided_at, status, source_load_id OR DELETE ON accounting.invoices
  FOR EACH ROW EXECUTE FUNCTION accounting.revert_load_on_invoice_death();

-- DATA: every load at 'invoiced' with no live issued invoice reverts under rule (b). On prod: 13503, 13504, 13539.
UPDATE mdata.loads l
   SET status = accounting.load_status_before_invoiced(l.id)::mdata.load_status_enum,
       updated_at = now()
 WHERE l.status::text = 'invoiced'
   AND NOT accounting.load_has_live_issued_invoice(l.id, l.operating_company_id);

DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM mdata.loads l
   WHERE l.status::text = 'invoiced' AND NOT accounting.load_has_live_issued_invoice(l.id, l.operating_company_id);
  IF n <> 0 THEN
    RAISE EXCEPTION '202615300100: % load(s) still at invoiced with no live issued invoice', n;
  END IF;
END $$;
COMMIT;
