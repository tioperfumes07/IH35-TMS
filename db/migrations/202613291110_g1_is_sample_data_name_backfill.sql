-- GO-CLOSE-188 owner G1 (corrected 2026-08-30 reply) — "the TEST label must actually set
-- is_sample_data. It does not." mdata.customers/mdata.vendors accepted is_sample_data as an
-- explicit opt-in field (ACCT-F220) but nothing ever DERIVED it from the name a human actually
-- typed, so every fixture row someone named TEST/DEMO/SAMPLE went in untagged.
--
-- WHAT WAS WRONG, measured live before this migration
--   mdata.customers: 17 rows matching the word-boundary TEST/DEMO/SAMPLE pattern, 0 flagged.
--   mdata.vendors:   39 rows named TEST, 36 unflagged (owner's own count, exact match).
-- INV-7 (verify-gl-invariants.sql) shows the consequence: 213,289.36 in sample debits sitting
-- inside the REAL trial balance and growing 25,456.11 in two days as of the owner's last read.
--
-- WHY word-boundary, not a bare substring or a TEST%-prefix
-- apps/backend/src/mdata/sample-data-name-detection.ts (companion write-path fix, same PR) is the
-- single source of truth for the pattern; this migration inlines the equivalent Postgres regex so
-- the two stay in lockstep by construction rather than by convention. A bare substring match on
-- "demo" would have wrongly flagged the real vendor "Loves-IN471-DEMOTTE (deleted)" — confirmed
-- live before writing this migration. Word-boundary (\y in Postgres regex) excludes it while still
-- catching every real fixture shape observed live: suffix ("CC2-BOOKLOAD-INLINE-TEST"), embedded
-- ("GUARD-TEST-customers-name-TRANSP"), and lowercase ("Cascade-void-test-20260826").
--
-- SCOPE — backfill only, idempotent, additive
-- Sets is_sample_data = true ONLY on rows that are currently NOT already true AND whose name
-- matches the pattern. A row a human has already explicitly tagged either way is untouched (this
-- migration never sets it to false, and never re-touches an already-true row). Entity-agnostic —
-- the defect and its fix are name-pattern-based, not entity-scoped. Does not touch any GL/JE row;
-- INV-7's sample-debit total will fall on its own once already-posted JEs are re-derived from these
-- corrected source flags by whatever process consumes them (out of scope here — see the write-path
-- fix in the same PR for going-forward correctness, and REMAINING in the shipping commit for the
-- already-posted-JE question, which is an owner-level correcting-entry decision, not a migration's).

BEGIN;

UPDATE mdata.customers
   SET is_sample_data = true,
       updated_at = now()
 WHERE COALESCE(is_sample_data, false) = false
   AND customer_name ~* '\y(test|demo|sample)\y';

UPDATE mdata.vendors
   SET is_sample_data = true,
       updated_at = now()
 WHERE COALESCE(is_sample_data, false) = false
   AND vendor_name ~* '\y(test|demo|sample)\y';

COMMIT;
