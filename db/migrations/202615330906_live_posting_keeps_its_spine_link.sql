-- 202615330906 · CC-3 · standing order 2026-10-03 — the invoice spine path, 48 postings / $178,938.00.
-- Measured on prod under SET LOCAL app.bypass_rls = 'lucia': 24 "Void reversal of invoice" JEs (48 lines, 1100 Cr /
-- 1150 Dr, $89,469.00 each side, written 2026-09-25 by postVoidReversal) carry NO transaction_source_links row. They
-- were written WITH one (postVoidReversal links every reversal line, same transaction, since #973); audit.row_changes
-- shows all 48 links DELETED at 2026-09-30 17:28:12Z by the AUTH-177 owner purge
-- (scripts/ops/2026-09-30-lead-owner-purge-voided-and-sample-usmca.ts), which deleted the voided invoices and the links
-- pointing at them but left both JEs of each reversal pair live in the GL.
-- Rule, enforced at COMMIT (deferred, so a governed purge that deletes the posting in the same transaction passes —
-- accounting.delete_cancelled_load_revrec and the ROUND 326 complete-delete both do): a transaction_source_links row
-- may not be deleted, or moved off its posting, if that posting still exists and is left with no link at all.
-- The 48 already-stripped lines are not touched (they are purge population); the rule gates new deletes only.
-- Idempotent.

CREATE OR REPLACE FUNCTION accounting.refuse_orphaning_posting_spine()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.journal_entry_posting_id IS NOT DISTINCT FROM OLD.journal_entry_posting_id THEN
    RETURN NULL;
  END IF;
  IF OLD.journal_entry_posting_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM accounting.journal_entry_postings p WHERE p.id = OLD.journal_entry_posting_id)
     AND NOT EXISTS (SELECT 1 FROM accounting.transaction_source_links l WHERE l.journal_entry_posting_id = OLD.journal_entry_posting_id) THEN
    RAISE EXCEPTION 'journal_entry_posting % would be left with no transaction_source_links row — delete the posting with its link (governed purge) or keep the link', OLD.journal_entry_posting_id
      USING ERRCODE = '23503';
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_live_posting_keeps_spine_link ON accounting.transaction_source_links;
CREATE CONSTRAINT TRIGGER trg_live_posting_keeps_spine_link
  AFTER DELETE OR UPDATE OF journal_entry_posting_id ON accounting.transaction_source_links
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION accounting.refuse_orphaning_posting_spine();
