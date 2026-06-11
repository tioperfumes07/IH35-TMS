═══════════════════════════════════════════════════════════════
BLOCK A1 — AUDIT-SPINE-LINK-COLUMNS
Relates to: Universal Audit Linkage, Layer 2 (LINK). DB foundation for all A-blocks.
═══════════════════════════════════════════════════════════════

GOAL
Add the linkage columns to the spine so every event can point back to the exact
source record that caused it. Additive, backfilled, immutability preserved.

TO THE CODER — build off current main (one block at a time):
  git checkout main && git pull origin main && npm install
  git checkout -b feat/a1-audit-spine-link-columns

MIGRATION — db/migrations/<next-timestamp>_a1_audit_spine_link_columns.sql
  - ALTER TABLE events.event_log
      ADD COLUMN IF NOT EXISTS source_table       text,
      ADD COLUMN IF NOT EXISTS source_reference_id uuid,
      ADD COLUMN IF NOT EXISTS actor_user_id       uuid,   -- if not already present
      ADD COLUMN IF NOT EXISTS correlation_id      uuid;    -- groups multi-step actions
  - These are NULLABLE with no default — additive, safe on a populated table.
  - Add index: CREATE INDEX IF NOT EXISTS idx_event_log_source
      ON events.event_log (source_table, source_reference_id);
  - Add index: CREATE INDEX IF NOT EXISTS idx_event_log_entity
      ON events.event_log (entity_type, entity_id);
  - DO NOT touch the existing append-only / immutability trigger — these are new
    columns only. Confirm the immutability trigger still fires (RAISE on UPDATE/DELETE).
  - "declare" not "decl"; no generated-column chains.

log_event() SIGNATURE UPDATE (additive, backward-compatible)
  - Extend events.log_event(...) to accept optional p_source_table text,
    p_source_reference_id uuid, p_correlation_id uuid (default NULL).
  - Existing callers that don't pass them keep working (NULLs). New callers pass them.
  - Keep the function's existing behavior otherwise identical.

NO BACKFILL OF HISTORY (events are immutable — we never rewrite past rows). New
events from A2+ will carry the linkage. Document this in the PR body.

PRE-PUSH: node scripts/db-migrate.mjs > /tmp/mig.txt 2>&1; echo "EXIT:$?">>/tmp/mig.txt; tail -20 /tmp/mig.txt
  → MUST reach the new migration APPLY, EXIT:0
verify-a1-audit-spine-link.mjs guard: assert columns + indexes exist in the migration,
  assert log_event signature includes the new optional params, assert immutability
  trigger block still present.
Push BLOCK_ID=A1-AUDIT-SPINE-LINK-COLUMNS, ls-remote, open PR. Report PR# + SHA.
═══════════════════════════════════════════════════════════════
