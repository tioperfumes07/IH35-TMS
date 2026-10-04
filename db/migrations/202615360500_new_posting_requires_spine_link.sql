-- ROUND 373.3 (CC-1) — A POSTING CANNOT COMMIT WITHOUT ITS SPINE LINK.
--
-- trg_live_posting_keeps_spine_link (202615330906) is a deferred constraint trigger on accounting.transaction_source_links
-- that fires only on link DELETE / UPDATE OF journal_entry_posting_id: it keeps an existing link from being orphaned, but
-- a posting INSERTED with no link at all was never refused. That is how 3,908 USMCA postings (journal_entries.source
-- 'auto', 2026-09-24 → 2026-09-30) came to name no document.
--
-- Sequencing (373.3): the writers first, then the backfill, then the refusal. Measured 2026-10-03 (prod, direct): every
-- one of the 10 backend paths that INSERTs accounting.journal_entry_postings writes its transaction_source_links row
-- per line in the same transaction, and 0 of the 78 postings created in the last three days lack a link. The backfill
-- of the 3,908 was WITHDRAWN (ROUND 380: the documents are gone; the purge takes them) — they predate this trigger and
-- are untouched by it (INSERT only).
--
-- The refusal: a deferred constraint trigger AFTER INSERT on journal_entry_postings. At COMMIT, a posting with no
-- transaction_source_links row naming it is refused. A posting deleted in the same transaction (the governed purge) is
-- skipped. Guard: scripts/verify-every-posting-has-its-spine-link.mjs (now enforcing, wired).
--
-- Idempotent: CREATE OR REPLACE FUNCTION; DROP TRIGGER IF EXISTS + CREATE CONSTRAINT TRIGGER. No data change.

CREATE OR REPLACE FUNCTION accounting.refuse_posting_without_spine_link()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- the row may have been removed later in the same transaction (governed purge) — nothing to check then
  IF NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings p WHERE p.id = NEW.id) THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM accounting.transaction_source_links l WHERE l.journal_entry_posting_id = NEW.id) THEN
    RAISE EXCEPTION
      'posting_without_spine_link_refused: journal_entry_postings % (journal entry %, % % cents) has no transaction_source_links row — every posting names the document that caused it (ROUND 373.3)',
      NEW.id, NEW.journal_entry_uuid, NEW.debit_or_credit, NEW.amount_cents
      USING ERRCODE = 'P0001',
            HINT = 'Post through the posting engine / createJournalEntryOnClient, which write the spine link per line in the same transaction (writeTransactionSourceLink).';
  END IF;
  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION accounting.refuse_posting_without_spine_link() IS
  'ROUND 373.3: refuses at COMMIT a journal_entry_postings row inserted without a transaction_source_links row naming it. The DELETE/UPDATE side is trg_live_posting_keeps_spine_link.';

DROP TRIGGER IF EXISTS trg_new_posting_has_spine_link ON accounting.journal_entry_postings;
CREATE CONSTRAINT TRIGGER trg_new_posting_has_spine_link
  AFTER INSERT ON accounting.journal_entry_postings
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION accounting.refuse_posting_without_spine_link();
