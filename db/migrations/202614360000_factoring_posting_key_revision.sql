-- 202614360000_factoring_posting_key_revision.sql
-- R-159.2 (Claude-Lead ruling, 2026-09-25 06:20 PM CT/23:20Z): a factoring lifecycle posting-key
-- claim (accounting.factoring_lifecycle_posting_keys) is PERMANENT once made -- a reversal never
-- released it, so a corrected re-post of the SAME event (e.g. re-splitting a bundled wire fee) had
-- no supported path: the engine's own idempotency guard treated the reversed original as still
-- "already posted" forever. Confirmed live (AUTH-035, FAC-2026-00001): reverse succeeded, re-post
-- refused with gate=already_posted, atomically rolled back.
--
-- Fix, matching how NetSuite/QBO handle a reversed-and-corrected transaction: the original claim and
-- its JE are NEVER edited or deleted (void-never-delete holds). When that claim's JE has since been
-- reversed, a NEW claim is allowed under a revision key (event_key || '#rev' || n, n = next integer
-- for that advance+type+base event), recording which prior claim it supersedes via reversal_of. The
-- existing UNIQUE (operating_company_id, factoring_advance_id, source_transaction_type, event_key)
-- constraint is UNCHANGED -- a revision key is simply a new, distinct value under it, so a second
-- LIVE (unreversed) claim for the same event is still refused exactly as before. One extra column,
-- additive only, no data change, no existing row touched.

ALTER TABLE accounting.factoring_lifecycle_posting_keys
  ADD COLUMN IF NOT EXISTS reversal_of uuid REFERENCES accounting.factoring_lifecycle_posting_keys(id);

COMMENT ON COLUMN accounting.factoring_lifecycle_posting_keys.reversal_of IS
  'R-159.2: when this claim is a revision (event_key like ''<base>#revN''), the prior claim row it '
  'supersedes -- that prior claim''s own journal_entry_id was reversed, which is what authorized '
  'this new claim to exist. NULL for an original (non-revision) claim.';

CREATE INDEX IF NOT EXISTS idx_factoring_lifecycle_posting_keys_reversal_of
  ON accounting.factoring_lifecycle_posting_keys (reversal_of)
  WHERE reversal_of IS NOT NULL;
