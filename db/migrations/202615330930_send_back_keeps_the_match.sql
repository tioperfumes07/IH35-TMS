-- 202615330930 · CC-3 · ROUND 363-CC3-B / LAW 363.9 — a send-back KEEPS the accepted match and records the release
-- beside it. Measured on prod (2026-10-03, direct endpoint): 248 bank lines went matched -> for_review between Sep 3 and
-- Oct 3; 0 of 3,085 reversal lines trace back to a bank match; every send-back path NULLed matched_* (matched_load_id
-- included) and, at best, flipped the accepted reconciliation_matches row to 'rejected' in place — one path
-- (void.service unmatchBankTransactionById) built its trail from the post-UPDATE RETURNING row, so it recorded nothing.
--
-- No new table. On banking.reconciliation_matches:
--   * a release is match_state 'released' + released_at / _by / release_reason / release_kind / released_from_state /
--     release_reversal_je_id. matched_at / matched_by_user_uuid (the accepted fact) are never touched.
--   * uniqueness holds only among rows that are not released, so the same pair can be matched again after a release
--     and both cycles stay readable.
--   * 'advance' joins the kind CHECK (matched_advance_id -> driver_finance.driver_advances had no kind).
-- banking.release_bank_line_matches() records the release for every matched_* pointer a line carries — the one writer
-- every send-back path (and the governed purge reset) calls BEFORE it clears the pointers.
-- REFUSAL (deferred, at COMMIT): a matched_* pointer may not be cleared or moved unless its pair carries a 'released'
-- row, or the bank line itself is voided (a superseded Plaid pending row / a voided line takes its matches with it).
-- Idempotent.

SET LOCAL search_path TO pg_catalog, public;

ALTER TABLE banking.reconciliation_matches
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_by_user_uuid uuid REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS release_reason text,
  ADD COLUMN IF NOT EXISTS release_kind text,
  ADD COLUMN IF NOT EXISTS released_from_state text,
  -- No FK, like ledger_entry_id: the governed purge deletes journal entries and never touches banking.*, so an FK here
  -- would block it; a purged reversal stays named, and audit.record_deletions carries the row.
  ADD COLUMN IF NOT EXISTS release_reversal_je_id uuid;

ALTER TABLE banking.reconciliation_matches DROP CONSTRAINT IF EXISTS reconciliation_matches_match_state_check;
ALTER TABLE banking.reconciliation_matches ADD CONSTRAINT reconciliation_matches_match_state_check
  CHECK (match_state IN ('auto_matched', 'user_matched', 'rejected', 'released'));

ALTER TABLE banking.reconciliation_matches DROP CONSTRAINT IF EXISTS reconciliation_matches_release_complete;
ALTER TABLE banking.reconciliation_matches ADD CONSTRAINT reconciliation_matches_release_complete CHECK (
  (match_state = 'released') = (released_at IS NOT NULL)
  AND (released_at IS NULL OR (
        release_kind IN ('unmatch', 'undo', 'void', 'transfer_revoke', 'purge_reset')
    AND btrim(coalesce(release_reason, '')) <> ''
    AND released_from_state IN ('auto_matched', 'user_matched', 'rejected', 'pointer_only')))
);

ALTER TABLE banking.reconciliation_matches DROP CONSTRAINT IF EXISTS reconciliation_matches_ledger_entry_kind_check;
ALTER TABLE banking.reconciliation_matches ADD CONSTRAINT reconciliation_matches_ledger_entry_kind_check CHECK (
  ledger_entry_kind IN ('payment', 'bill_payment', 'transfer', 'je', 'expense', 'load', 'bill', 'settlement',
                        'driver_bill', 'factoring_advance', 'invoice', 'fuel_transaction', 'relay_fuel', 'advance')
);

ALTER TABLE banking.reconciliation_matches DROP CONSTRAINT IF EXISTS reconciliation_matches_bank_transaction_id_ledger_entry_kin_key;
CREATE UNIQUE INDEX IF NOT EXISTS reconciliation_matches_live_pair_key
  ON banking.reconciliation_matches (bank_transaction_id, ledger_entry_kind, ledger_entry_id)
  WHERE match_state <> 'released';

-- The 13 pointers and the kind each one is recorded under.
CREATE OR REPLACE FUNCTION banking.bank_line_match_pointers(p jsonb)
RETURNS TABLE (kind text, ledger_entry_id uuid)
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT m.kind, (p ->> m.col)::uuid
    FROM (VALUES ('matched_load_id', 'load'), ('matched_bill_id', 'bill'), ('matched_settlement_id', 'settlement'),
                 ('matched_expense_id', 'expense'), ('matched_transfer_id', 'transfer'), ('matched_payment_id', 'payment'),
                 ('matched_bill_payment_id', 'bill_payment'), ('matched_journal_entry_id', 'je'),
                 ('matched_factoring_advance_id', 'factoring_advance'), ('matched_invoice_id', 'invoice'),
                 ('matched_fuel_transaction_id', 'fuel_transaction'), ('matched_relay_fuel_transaction_id', 'relay_fuel'),
                 ('matched_advance_id', 'advance')) AS m(col, kind)
   WHERE p ->> m.col IS NOT NULL
$$;

-- Record the release of every match a bank line carries right now. Call it BEFORE clearing the pointers, in the same
-- transaction. A pointer with no match row (categorize / match writers that only set the pointer) gets its accepted
-- row written from the line itself (matched_at = when it was categorized) and released in the same statement, so the
-- history exists either way. Returns the number of matches released.
CREATE OR REPLACE FUNCTION banking.release_bank_line_matches(
  p_bank_transaction_id uuid,
  p_release_kind text,
  p_reason text,
  p_actor_user_id uuid
) RETURNS integer
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  bt banking.bank_transactions%ROWTYPE;
  ptr record;
  n integer := 0;
  ptr_rows integer := 0;
BEGIN
  SELECT * INTO bt FROM banking.bank_transactions WHERE id = p_bank_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  FOR ptr IN SELECT * FROM banking.bank_line_match_pointers(to_jsonb(bt)) LOOP
    -- Already released in THIS transaction (an outer send-back released first and an inner step asks again before the
    -- pointer clears): once is the record. Never a second row for the same release.
    IF EXISTS (SELECT 1 FROM banking.reconciliation_matches rm
                WHERE rm.bank_transaction_id = bt.id AND rm.ledger_entry_kind = ptr.kind
                  AND rm.ledger_entry_id = ptr.ledger_entry_id AND rm.match_state = 'released' AND rm.released_at = now()) THEN
      CONTINUE;
    END IF;
    UPDATE banking.reconciliation_matches rm
       SET released_from_state = rm.match_state,
           match_state = 'released',
           released_at = now(),
           released_by_user_uuid = p_actor_user_id,
           release_reason = p_reason,
           release_kind = p_release_kind,
           updated_at = now()
     WHERE rm.bank_transaction_id = bt.id
       AND rm.ledger_entry_kind = ptr.kind
       AND rm.ledger_entry_id = ptr.ledger_entry_id
       AND rm.match_state <> 'released';
    IF NOT FOUND THEN
      INSERT INTO banking.reconciliation_matches (
        operating_company_id, bank_transaction_id, ledger_entry_kind, ledger_entry_id, match_score, match_state,
        matched_at, matched_by_user_uuid, released_from_state, released_at, released_by_user_uuid, release_reason,
        release_kind)
      VALUES (bt.operating_company_id, bt.id, ptr.kind, ptr.ledger_entry_id, 1, 'released',
              coalesce(bt.categorized_at, bt.updated_at, now()), coalesce(bt.categorized_by_user_id, p_actor_user_id),
              'pointer_only', now(), p_actor_user_id, p_reason, p_release_kind);
    END IF;
    n := n + 1;
  END LOOP;
  -- A live accepted row with no pointer behind it (a matcher that wrote the row but not the pointer) goes back to the
  -- pool with the line too — released, never left 'user_matched' to hide its document from the Match drawer.
  UPDATE banking.reconciliation_matches rm
     SET released_from_state = rm.match_state,
         match_state = 'released',
         released_at = now(),
         released_by_user_uuid = p_actor_user_id,
         release_reason = p_reason,
         release_kind = p_release_kind,
         updated_at = now()
   WHERE rm.bank_transaction_id = bt.id
     AND rm.voided_at IS NULL
     AND rm.match_state IN ('auto_matched', 'user_matched');
  GET DIAGNOSTICS ptr_rows = ROW_COUNT;
  RETURN n + ptr_rows;
END
$$;

-- Name the reversal a send-back produced on the matches it released (release_reversal_je_id), and link the reversal's
-- postings to the bank line so the reversal reaches it from the ledger side (relationship_role 'released_from_bank_line').
CREATE OR REPLACE FUNCTION banking.attach_release_reversal(
  p_bank_transaction_id uuid,
  p_reversal_je_id uuid
) RETURNS integer
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE banking.reconciliation_matches
     SET release_reversal_je_id = p_reversal_je_id, updated_at = now()
   WHERE bank_transaction_id = p_bank_transaction_id
     AND match_state = 'released'
     AND released_at = now()
     AND release_reversal_je_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO accounting.transaction_source_links (operating_company_id, journal_entry_posting_id, linked_object_type,
                                                  linked_object_id, relationship_role)
  SELECT p.operating_company_id, p.id, 'bank_transaction', p_bank_transaction_id::text, 'released_from_bank_line'
    FROM accounting.journal_entry_postings p
   WHERE p.journal_entry_uuid = p_reversal_je_id
     AND NOT EXISTS (SELECT 1 FROM accounting.transaction_source_links l
                      WHERE l.journal_entry_posting_id = p.id AND l.linked_object_type = 'bank_transaction'
                        AND l.linked_object_id = p_bank_transaction_id::text AND l.relationship_role = 'released_from_bank_line');
  RETURN n;
END
$$;

CREATE OR REPLACE FUNCTION banking.refuse_unreleased_match_clear()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  ptr record;
  newp jsonb := to_jsonb(NEW);
BEGIN
  IF NEW.voided_at IS NOT NULL THEN
    RETURN NULL;
  END IF;
  FOR ptr IN SELECT * FROM banking.bank_line_match_pointers(to_jsonb(OLD)) LOOP
    IF (SELECT p.ledger_entry_id FROM banking.bank_line_match_pointers(newp) p WHERE p.kind = ptr.kind)
         IS DISTINCT FROM ptr.ledger_entry_id
       AND NOT EXISTS (SELECT 1 FROM banking.reconciliation_matches rm
                        WHERE rm.bank_transaction_id = OLD.id AND rm.ledger_entry_kind = ptr.kind
                          AND rm.ledger_entry_id = ptr.ledger_entry_id AND rm.match_state = 'released') THEN
      RAISE EXCEPTION 'bank line % lost its % match % with no released reconciliation_matches row — call banking.release_bank_line_matches() before clearing a match (LAW 363.9: a send-back keeps the match)',
        OLD.id, ptr.kind, ptr.ledger_entry_id
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_send_back_keeps_the_match ON banking.bank_transactions;
CREATE CONSTRAINT TRIGGER trg_send_back_keeps_the_match
  AFTER UPDATE ON banking.bank_transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION banking.refuse_unreleased_match_clear();

GRANT EXECUTE ON FUNCTION banking.bank_line_match_pointers(jsonb) TO ih35_app;
GRANT EXECUTE ON FUNCTION banking.release_bank_line_matches(uuid, text, text, uuid) TO ih35_app;
GRANT EXECUTE ON FUNCTION banking.attach_release_reversal(uuid, uuid) TO ih35_app;
