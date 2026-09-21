-- ROUND 29.5 owner ruling (2026-09-22) — item 2, "THE CONSTRAINT IS THE BUG, NOT THE DESCRIPTIONS":
--
-- uq_settlement_lines_no_duplicate_lines (a partial UNIQUE INDEX, not a named CONSTRAINT — verified
-- live via pg_indexes before writing this file: `CREATE UNIQUE INDEX ... ON driver_finance.
-- settlement_lines USING btree (settlement_id, line_type, description, amount) WHERE (is_active =
-- true AND line_type <> 'reimbursement')`) has NO load_id in its key. ROUND 28 STEP 3 PHASE 2
-- (scripts/ops/round28-step3-phase2-additions.ts) hit this live: two DIFFERENT loads on the SAME
-- settlement genuinely both billing an identical description+amount (e.g. two loads each carrying
-- "Driver Pay-Enlonada" $25.00) collided on this index — the exact SAME class of bug that script's
-- own idempotency dup-check had (missing load_id in its match), just at the schema layer instead of
-- application code. The workaround at the time (prefixing 17 descriptions with "Load {number} — " to
-- force uniqueness) was a cosmetic patch on the SYMPTOM, ruled out by the owner as the wrong fix —
-- PERMANENT LAW per this ruling: load_id is never optional in a settlement-line uniqueness key.
--
-- FIX: drop the load_id-less index; recreate scoped to (settlement_id, load_id, line_type,
-- description, amount) WITH THE SAME is_active/line_type<>'reimbursement' partial WHERE clause,
-- using NULLS NOT DISTINCT (Postgres 16, confirmed live via `SELECT version()` before writing this —
-- both prod and any branch run 16) so a settlement-level line with load_id IS NULL still cannot
-- duplicate itself (two NULL load_id rows are still treated as equal for uniqueness purposes, matching
-- ordinary non-NULL behavior, instead of Postgres's default NULL-is-never-equal-to-NULL semantics that
-- would otherwise let unlimited load_id-less duplicates through).
--
-- SAFE BY CONSTRUCTION: the new key is a REFINEMENT (adds a column), not a relaxation — every row
-- pair the OLD index already forbade (same settlement_id/line_type/description/amount) is still
-- forbidden by the new one only when load_id also matches; two DIFFERENT loads' now-legitimately-
-- distinct rows (previously impossible to create at all) are the only newly-permitted shape.
-- Idempotent (IF EXISTS / IF NOT EXISTS). No data touched, no row migrated — this is an index-only
-- change; the 17 "Load {number} — " description prefixes from the workaround are reverted in the
-- SAME PR that ships this file (see scripts/ops/round28-step3-phase2c-revert-load-prefix.ts), never
-- mixed into this migration itself.

BEGIN;

DO $$
BEGIN
  IF to_regclass('driver_finance.settlement_lines') IS NULL THEN
    RAISE NOTICE 'Skipping settlement_lines duplicate-key fix: table missing';
    RETURN;
  END IF;

  EXECUTE 'DROP INDEX IF EXISTS driver_finance.uq_settlement_lines_no_duplicate_lines';

  EXECUTE $idx$
    CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_lines_no_duplicate_lines
      ON driver_finance.settlement_lines (settlement_id, load_id, line_type, description, amount)
      NULLS NOT DISTINCT
      WHERE (is_active = true AND line_type <> 'reimbursement')
  $idx$;
END $$;

COMMIT;
