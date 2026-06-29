-- ============================================================================
-- GL idempotency uniqueness on accounting.journal_entry_postings (CODER-28B)
-- Tier-1, BUILD-AND-HOLD — Jorge labels after GUARD Neon-verifies; do NOT self-merge
-- (§1.4: migration on an accounting.* table).
-- ----------------------------------------------------------------------------
-- GAP (GUARD "Part 10"): a retried GL post can double-write ledger lines because
-- journal_entry_postings (JEP) has NO uniqueness on idempotency_key. Idempotency is
-- enforced today only on the PARENT table accounting.posting_batches
-- (uq_posting_batches_company_idempotency_key, migration 0195) plus the posting-engine
-- pre-check getExistingPostingResultByIdempotencyKey. This index is the DB BACKSTOP at
-- the line grain.
--
-- GRAIN — composite (operating_company_id, idempotency_key, line_sequence), NOT the
-- 2-column (operating_company_id, idempotency_key) originally specced. VERIFY-FIRST proved
-- the 2-col index would 500 normal traffic: posting-engine.service.ts and
-- fuel-posting/poster.service.ts write the SAME idempotency_key to EVERY line of a
-- multi-line entry (line_sequence increments 1..N) — by design, because the key is
-- per-BATCH. A 2-col unique index would reject line 2 of the FIRST legitimate post
-- (e.g. invoice AR + revenue + tax = 3 lines, one key). The composite grain blocks a true
-- line-level double-post (a batch re-inserting the same sequence) while never rejecting
-- legitimate distinct lines. GUARD prod-verified ZERO existing duplicates at this grain.
--
-- Entity-scoped (per-opco), partial (NULL keys — manual JE / void / recurring / period-close
-- inserts — are unconstrained), idempotent (IF NOT EXISTS). No insert-path / read-path
-- changes: the index is a pure backstop. A genuine line-level duplicate now fails loudly
-- (23505 → caller's transaction rolls back) instead of silently double-posting.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_jep_company_idempotency_line
  ON accounting.journal_entry_postings (operating_company_id, idempotency_key, line_sequence)
  WHERE idempotency_key IS NOT NULL;
