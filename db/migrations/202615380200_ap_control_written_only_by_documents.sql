-- ROUND 393.1 (CC-1) — A/P IS A CONTROL ACCOUNT. IT IS WRITTEN ONLY BY ITS DOCUMENTS.
--
-- Measured 2026-10-04 (prod, DIRECT, bypass_rls='lucia', USMCA): account 2000 (the ap_control role) = $3,542.98 credit;
-- open-bill subledger = $566.35; variance $2,976.63 = 60 lines with source_transaction_type 'journal_entry'. Each is a
-- "DEFECT 3" re-reversal (Aug 29 – Sep 19): an expense credited A/P (itself wrong), its void reversed that correctly to
-- net 0, and a correction script then reversed the reversal — putting the A/P credit back on a voided expense. The 60
-- source expense rows no longer exist. A reversal of a reversal is how a plug re-enters a control account.
--
-- The rule, at the database, resolved through the ROLE table (never by account number — 365.1):
--   on an account that carries the company's active ap_control role, a posting may only be written by
--     * source 'bill'                                   — the document that creates A/P (and its own corrections)
--     * source 'bill_payment' / 'vendor_credit'         — the documents that reduce it
--     * source 'driver_settlement' as a DEBIT           — settlement deductions applied against the driver's real
--                                                         load bills (settlement-ap-chain / settlement-bill-payment
--                                                         posting: Dr A/P · Cr driver accounts); refusing it would
--                                                         stop every settlement close
--     * any other source ONLY as a reversal that TAKES AN AMOUNT AWAY: odd depth along reversal_of_line_id (a
--       reversal of an original line). An even depth — a reversal of a reversal — puts an amount back with no
--       document and is REFUSED. That is exactly the DEFECT-3 shape; undoing it (depth 3) is allowed.
--   Everything else is refused at write time (BEFORE INSERT). The posting-fact trigger (202615360200) already refuses
--   moving an existing line onto A/P by UPDATE.
--
-- Not touched: the 60 existing lines (step 3 needs the owner — their documents are gone).
-- Idempotent: CREATE OR REPLACE FUNCTION; DROP TRIGGER IF EXISTS + CREATE TRIGGER. No data change.

CREATE OR REPLACE FUNCTION accounting.refuse_ap_control_write_without_document()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_depth integer := 0;
  v_line uuid := NEW.reversal_of_line_id;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles r
     WHERE r.operating_company_id = NEW.operating_company_id
       AND r.account_id = NEW.account_id
       AND r.role = 'ap_control'
       AND r.is_active
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.source_transaction_type IN ('bill', 'bill_payment', 'vendor_credit') THEN
    RETURN NEW;
  END IF;
  IF NEW.source_transaction_type = 'driver_settlement' AND NEW.debit_or_credit = 'debit' THEN
    RETURN NEW;
  END IF;

  -- depth along the reversal chain: 1 = reverses an original line (removes it), 2 = reverses a reversal (re-adds), …
  WHILE v_line IS NOT NULL AND v_depth < 20 LOOP
    v_depth := v_depth + 1;
    SELECT p.reversal_of_line_id INTO v_line FROM accounting.journal_entry_postings p WHERE p.id = v_line;
  END LOOP;
  IF v_depth % 2 = 1 THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'ap_control_write_refused: % % cents to A/P (account %) from source_transaction_type=% (reversal depth %) — A/P is written only by a bill, a bill payment, a vendor credit or settlement deductions applied to load bills; any other line may only reverse an original (ROUND 393.1)',
    NEW.debit_or_credit, NEW.amount_cents, NEW.account_id, COALESCE(NEW.source_transaction_type, '(none)'), v_depth
    USING ERRCODE = 'P0001',
          HINT = 'Enter the bill (or bill payment / vendor credit). A correcting journal entry on A/P is the plug this rule exists to refuse.';
END;
$function$;

COMMENT ON FUNCTION accounting.refuse_ap_control_write_without_document() IS
  'ROUND 393.1: a posting on the company''s ap_control account must come from a bill / bill_payment / vendor_credit (or settlement deductions applied to load bills, debit only), or be a reversal at odd depth (removing an amount). Refused at write time otherwise.';

DROP TRIGGER IF EXISTS trg_ap_control_written_only_by_documents ON accounting.journal_entry_postings;
CREATE TRIGGER trg_ap_control_written_only_by_documents
  BEFORE INSERT ON accounting.journal_entry_postings
  FOR EACH ROW
  EXECUTE FUNCTION accounting.refuse_ap_control_write_without_document();
