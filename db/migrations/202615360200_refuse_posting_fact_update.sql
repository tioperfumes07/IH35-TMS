-- ROUND 363-CC1-D (LAW 363.3 / 363.5) — CC-1.
--
-- 1. A POSTED LINE IS NEVER MOVED IN PLACE. accounting.journal_entry_postings already refuses DELETE
--    (trg_worm_refuse_delete); it did not refuse an UPDATE, so any code path could move a posting to another
--    account, amount, side, company, class, entity, location or journal entry without restating its document.
--    Measured 2026-10-03 (prod, direct): every UPDATE of the table in apps/backend and scripts sets only the
--    bookkeeping columns below; account-merge.service already refuses to move posted history
--    (E_MERGE_HISTORICAL_POSTINGS_FORBIDDEN). The reclassify engine moves a line the only legal way — a
--    RECLASSIFICATION entry that reverses the old side and posts the new side, with its document rewritten in
--    the same transaction. This trigger makes that the only way, from anywhere, at the database.
--
--    Still writable (bookkeeping, not the posted fact):
--      description, updated_at, idempotency_key, source_trace_key,
--      register_cleared / register_cleared_at / register_cleared_by_user_id   (account register tick)
--    Writable ONCE, from NULL (a link filled in, never repointed):
--      source_transaction_type / source_transaction_id / source_transaction_line_id, load_id, reversed_by_line_id
--    Everything else — the posted fact — is refused.
--
-- 2. LAW 363.5 owner override, recorded: reclassify_batches.override_refusals and
--    reclassify_batch_lines.override_of_refusal (the refusal the owner's override bypassed, on the row).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS + CREATE TRIGGER.
-- No data change.

ALTER TABLE accounting.reclassify_batches ADD COLUMN IF NOT EXISTS override_refusals boolean NOT NULL DEFAULT false;
ALTER TABLE accounting.reclassify_batch_lines ADD COLUMN IF NOT EXISTS override_of_refusal text;

COMMENT ON COLUMN accounting.reclassify_batches.override_refusals IS
  'LAW 363.5: the owner applied this batch over the refused classes (A/R, A/P, inventory, payroll, subledger controls). Never a bank/cash ledger line. Each overridden line names the refusal in reclassify_batch_lines.override_of_refusal and has an accounting.reclassify.refusal_overridden audit row.';
COMMENT ON COLUMN accounting.reclassify_batch_lines.override_of_refusal IS
  'LAW 363.5: the refusal the owner''s override bypassed for this line (NULL = no override).';

CREATE OR REPLACE FUNCTION accounting.refuse_posting_fact_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  moved text[] := ARRAY[]::text[];
BEGIN
  IF NEW.operating_company_id IS DISTINCT FROM OLD.operating_company_id THEN moved := array_append(moved, 'operating_company_id'); END IF;
  IF NEW.journal_entry_uuid IS DISTINCT FROM OLD.journal_entry_uuid THEN moved := array_append(moved, 'journal_entry_uuid'); END IF;
  IF NEW.line_sequence IS DISTINCT FROM OLD.line_sequence THEN moved := array_append(moved, 'line_sequence'); END IF;
  IF NEW.account_id IS DISTINCT FROM OLD.account_id THEN moved := array_append(moved, 'account_id'); END IF;
  IF NEW.debit_or_credit IS DISTINCT FROM OLD.debit_or_credit THEN moved := array_append(moved, 'debit_or_credit'); END IF;
  IF NEW.amount_cents IS DISTINCT FROM OLD.amount_cents THEN moved := array_append(moved, 'amount_cents'); END IF;
  IF NEW.class_id IS DISTINCT FROM OLD.class_id THEN moved := array_append(moved, 'class_id'); END IF;
  IF NEW.location_id IS DISTINCT FROM OLD.location_id THEN moved := array_append(moved, 'location_id'); END IF;
  IF NEW.entity_uuid IS DISTINCT FROM OLD.entity_uuid THEN moved := array_append(moved, 'entity_uuid'); END IF;
  IF NEW.entity_type IS DISTINCT FROM OLD.entity_type THEN moved := array_append(moved, 'entity_type'); END IF;
  IF NEW.posting_batch_id IS DISTINCT FROM OLD.posting_batch_id THEN moved := array_append(moved, 'posting_batch_id'); END IF;
  IF NEW.reversal_of_line_id IS DISTINCT FROM OLD.reversal_of_line_id THEN moved := array_append(moved, 'reversal_of_line_id'); END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN moved := array_append(moved, 'created_at'); END IF;
  -- links: filled once from NULL, never repointed or cleared
  IF OLD.source_transaction_type IS NOT NULL AND NEW.source_transaction_type IS DISTINCT FROM OLD.source_transaction_type THEN moved := array_append(moved, 'source_transaction_type'); END IF;
  IF OLD.source_transaction_id IS NOT NULL AND NEW.source_transaction_id IS DISTINCT FROM OLD.source_transaction_id THEN moved := array_append(moved, 'source_transaction_id'); END IF;
  IF OLD.source_transaction_line_id IS NOT NULL AND NEW.source_transaction_line_id IS DISTINCT FROM OLD.source_transaction_line_id THEN moved := array_append(moved, 'source_transaction_line_id'); END IF;
  IF OLD.load_id IS NOT NULL AND NEW.load_id IS DISTINCT FROM OLD.load_id THEN moved := array_append(moved, 'load_id'); END IF;
  IF OLD.reversed_by_line_id IS NOT NULL AND NEW.reversed_by_line_id IS DISTINCT FROM OLD.reversed_by_line_id THEN moved := array_append(moved, 'reversed_by_line_id'); END IF;

  IF array_length(moved, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'posting_fact_update_refused: journal_entry_postings % — % cannot be changed in place', OLD.id, array_to_string(moved, ', ')
      USING ERRCODE = 'P0001',
            HINT = 'A posted line moves only by restating its document: the reclassify engine (reverse the old side, post the new side) or void-and-reissue. LAW 363.3.';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION accounting.refuse_posting_fact_update() IS
  'ROUND 363-CC1-D: a posted journal_entry_postings line is never moved in place (account, amount, side, company, JE, class, location, entity, batch, reversal pointer); links fill once from NULL. Moves go through the reclassify engine or void-and-reissue.';

DROP TRIGGER IF EXISTS trg_refuse_posting_fact_update ON accounting.journal_entry_postings;
CREATE TRIGGER trg_refuse_posting_fact_update
  BEFORE UPDATE ON accounting.journal_entry_postings
  FOR EACH ROW
  EXECUTE FUNCTION accounting.refuse_posting_fact_update();
