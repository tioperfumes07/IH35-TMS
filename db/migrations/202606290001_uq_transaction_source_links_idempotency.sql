-- ============================================================================
-- Idempotency for accounting.transaction_source_links (CODER-12 audit-spine, GUARD correction 2)
-- Tier-1 (audit trail). BUILD-AND-HOLD — GUARD verifies on a Neon branch, labels, merges.
-- ----------------------------------------------------------------------------
-- The audit spine wires 5 GL posters (manual JE, void, recurring, period-close, bank-recon variance)
-- to write a transaction_source_links row per posting line. The table has NO uniqueness today, so a
-- retried/re-run poster could duplicate link rows (audit-trail duplication). This unique index makes
-- the link write idempotent at the DB level (mirrors #1625's posting index), so a re-run is a safe
-- no-op via ON CONFLICT DO NOTHING in writeTransactionSourceLink.
--
-- COALESCE(relationship_role,'') so NULL-role rows (posting-engine/fuel-poster's existing pattern)
-- also dedupe deterministically. Table is empty (0 rows) -> instant build. Idempotent, self-contained.
-- ============================================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tsl_posting_object_role
  ON accounting.transaction_source_links
  (journal_entry_posting_id, linked_object_type, linked_object_id, COALESCE(relationship_role, ''));

COMMIT;
