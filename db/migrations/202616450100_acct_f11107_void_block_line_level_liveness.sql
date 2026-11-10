-- 202616450100 — ACCT-F11107 part 2: the void block (282.1) counts a posting line reversed AT LINE LEVEL as not live.
--
-- WHY (measured on prod 2026-11-10, USMCA): POST /api/v1/expenses/:id/void on 13584-6 (59d9b3ef, $490.00) and 13584-7
-- (87e6b3e2, $340.00) returned 500 P0001 "BLOCKED (282.1): … 2 live, unreversed journal_entry_posting(s)". Both documents
-- had been RECLASSIFIED: the reclass entry (396f6d93 / 1ad01d47) carries a line-level reversal of the original debit
-- (reversal_of_line_id set) and the new debit (the in-leg). The void engine (executeSourceReversalOnClient, AUTH-400)
-- reverses every LIVE line naming the document — liveness at LINE level (reversal_of_line_id IS NULL AND
-- reversed_by_line_id IS NULL) — so it reverses the original credit and the reclass in-leg and stamps reversed_by_line_id
-- on both. It links its reversal JE (reverses_je_id) to the ORIGINAL entry only; the reclass entry has no JE-level link.
-- fn_block_void_with_live_postings (202614610000) judged liveness at JOURNAL-ENTRY level only, so the reclass entry's two
-- lines (one already a reversal, one just reversed) still counted as live and every void of a reclassified document was
-- refused.
--
-- RULE: a line is live only if its entry is live (posted, not voided, not reversed, not a reversal) AND the line itself is
-- neither a reversal (reversal_of_line_id) nor reversed (reversed_by_line_id). The same two-level discriminator the engine
-- uses; a document whose money is still live at either level is still refused.
--
-- Idempotent: CREATE OR REPLACE FUNCTION only; the per-table constraint triggers (202614610000) are unchanged.

CREATE OR REPLACE FUNCTION accounting.fn_block_void_with_live_postings()
RETURNS trigger
LANGUAGE plpgsql
AS $BODY$
DECLARE
  v_source_type text := TG_ARGV[0];
  v_live_count int;
BEGIN
  IF NEW.voided_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.voided_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_live_count
    FROM accounting.journal_entry_postings jep
    JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
   WHERE jep.source_transaction_type = v_source_type
     AND jep.source_transaction_id = NEW.id::text
     AND je.status = 'posted'
     AND je.voided_at IS NULL
     AND je.reversed_by_je_id IS NULL
     AND je.reverses_je_id IS NULL
     -- ACCT-F11107: line-level liveness (AUTH-400) — a reversal line or a line already reversed is not live.
     AND jep.reversal_of_line_id IS NULL
     AND jep.reversed_by_line_id IS NULL;

  IF v_live_count > 0 THEN
    RAISE EXCEPTION
      'BLOCKED (282.1): % row % has voided_at set but % live, unreversed journal_entry_posting(s) (source_transaction_type=%) still reference it. Reverse the posting BEFORE (or in the same transaction as, before commit) setting voided_at.',
      TG_TABLE_NAME, NEW.id, v_live_count, v_source_type;
  END IF;

  RETURN NEW;
END;
$BODY$;
