-- ROUND 300 (CC-1, proven on a Neon fork) — a void reverses a DOCUMENT, and a document can be posted across several
-- journal entries (fuel: 2–4; a prepaid asset: the purchase + each amortization period). postVoidReversal writes ONE
-- reversing JE and, since ROUND 134.1, stamps reversed_by_je_id on EVERY original it reverses (the load-bearing
-- "is this original reversed" signal). uq_je_reversed_by_je_id (202607340000) allowed a reversing JE to be named by
-- only one original, so every multi-JE void failed with 23505 and rolled back (fork: voiding a prepaid asset with 3
-- posted periods -> HTTP 500).
--
-- The index's stated intent — "an original is reversed by at most one JE" — is already guaranteed by the column
-- itself (one reversed_by_je_id per original) and by every writer's `AND reversed_by_je_id IS NULL`. What it actually
-- enforced was 1:1 in the other direction, which a multi-JE document cannot satisfy. uq_je_reverses_je_id (a
-- reversing JE names one original in reverses_je_id) is unchanged.
--
-- DDL only, no data change. Idempotent. The lookup index is kept (plain, partial).
BEGIN;
DROP INDEX IF EXISTS accounting.uq_je_reversed_by_je_id;
CREATE INDEX IF NOT EXISTS ix_je_reversed_by_je_id
  ON accounting.journal_entries (reversed_by_je_id) WHERE reversed_by_je_id IS NOT NULL;
COMMIT;
