-- 202616420100 — ACCT-F11107: a REVERSAL posting batch never registers a fuel receipt.
--
-- WHY (measured on prod 2026-11-10, USMCA): POST /api/v1/expenses/e809fa4e-4389-4408-98f4-e3dbd3f8afda/void (expense 13586-1,
-- a DREAMLINE fuel receipt posted under source 'expense', live receipt batch f3756d9c) returned 500 / 23505
--   fuel_receipt_already_posted: receipt provider:5a529e97-…:99671555:diesel already has live posting batch f3756d9c
-- The void's reversal (posting-engine executeSourceReversalOnClient) INSERTs a posting_batches row for the same source
-- ('expense', <expense id>, idempotency key '…:reversal'). trg_register_fuel_receipt_posting (202615850910) treats EVERY
-- 'fuel_event' / 'expense' batch as a new posting of the receipt, finds the receipt's own live initial batch, and refuses.
-- So no fuel-receipt expense document posted under source 'expense' can be voided through the app's void engine — the
-- reversal that would RELEASE the receipt (trg_release_fuel_receipt_on_je_* when the reversal JE links reverses_je_id) is
-- refused before it exists.
--
-- RULE: a reversal batch un-posts a receipt; it is never a second posting of it. A batch whose idempotency key is a
-- reversal ('…:reversal', buildPostingMvpIdempotencyKey posting_purpose 'reversal') is not registered and not checked.
-- Every other batch keeps the one-live-posting rule unchanged.
--
-- Idempotent: CREATE OR REPLACE only; the trigger binding (202615850910) is unchanged.

CREATE OR REPLACE FUNCTION fuel.tg_register_fuel_receipt_posting()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_key text;
  v_existing uuid;
BEGIN
  -- ACCT-F11107: a reversal batch un-posts the receipt (its JE releases it); never registered, never refused.
  IF NEW.idempotency_key IS NOT NULL AND NEW.idempotency_key LIKE '%:reversal' THEN
    RETURN NEW;
  END IF;
  v_key := fuel.fuel_receipt_key(NEW.operating_company_id, NEW.source_transaction_type::text, NEW.source_transaction_id::text);
  IF v_key IS NULL THEN RETURN NEW; END IF;
  SELECT posting_batch_id INTO v_existing
    FROM fuel.fuel_receipt_postings
   WHERE operating_company_id = NEW.operating_company_id AND receipt_key = v_key AND released_at IS NULL
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'fuel_receipt_already_posted: receipt % already has live posting batch % — match or adopt it, never post it again', v_key, v_existing
      USING ERRCODE = 'unique_violation';
  END IF;
  INSERT INTO fuel.fuel_receipt_postings (operating_company_id, receipt_key, posting_batch_id)
  VALUES (NEW.operating_company_id, v_key, NEW.id);
  RETURN NEW;
END
$fn$;

COMMENT ON FUNCTION fuel.tg_register_fuel_receipt_posting() IS
  'LEAD 443.121 #1 + ACCT-F11107 — registers every fuel posting batch (one live posting per receipt); a reversal batch (idempotency key ending :reversal) un-posts and is never registered or refused.';
