-- 202607940000_load_cancellations_drop_legacy_reason_fk.sql
--
-- HELD — DO NOT RUN ON PROD until owner Neon-applies.
--
-- [HOLD-FOR-JORGE — TIER 1 · FINANCIAL CLUSTER] LST-F04 cancel-load P0.
--
-- ROOT CAUSE (verified on prod br-fancy-credit-akjnd07a 2026-07-24, lucia bypass):
--   dispatch.load_cancellations carries BOTH reason FKs live:
--     reason_code     NOT NULL -> catalogs.cancellation_reasons(reason_code)  [legacy global, 9 rows, RLS OFF]
--     reason_code_id  nullable -> catalogs.load_cancellation_reasons(id)      [canonical per-entity, FORCE RLS]
--   All 12 active per-entity reason codes (36 rows across 3 entities) are ABSENT from the legacy
--   9-row table. cancellation.service.ts reads the PER-ENTITY catalog and writes its reason_code
--   into the NOT-NULL column FK'd to the LEGACY table, so a cancel using any code the UI actually
--   shows violates a NOT-NULL-backed FK. Prod holds 1 cancellation row; it survived only because
--   its code ('CUSTOMER_CANCELLED') happens to exist in both tables.
--   Per LINKAGE LAW, catalogs.cancellation_reasons is a RETIRE table; the canonical home is
--   catalogs.load_cancellation_reasons. Consolidation must DROP/REPOINT the legacy FK, not merge rows.
--
-- SCOPE: drops the legacy FK and relaxes NOT NULL so the canonical reason_code_id becomes the link.
--   Deliberately does NOT make reason_code_id NOT NULL and does NOT drop reason_code or the legacy
--   table — both are gated on the writer repoint being live on prod (follow-up migration).
--
-- Idempotent: IF EXISTS / conditional NOT NULL drop; safe to re-apply.
-- void-not-delete: no row is deleted; the legacy table is left intact for the retirement follow-up.

BEGIN;

-- 1. Backfill any missing canonical link from the per-entity catalog by (opco, reason_code).
--    Matches on the entity the cancellation already belongs to, so it cannot cross entities.
UPDATE dispatch.load_cancellations lc
SET reason_code_id = r.id
FROM catalogs.load_cancellation_reasons r
WHERE lc.reason_code_id IS NULL
  AND r.operating_company_id = lc.operating_company_id
  AND r.reason_code = lc.reason_code;

-- 2. Drop the legacy NOT-NULL-backed FK to the retiring 9-row global table (the landmine).
ALTER TABLE dispatch.load_cancellations
  DROP CONSTRAINT IF EXISTS load_cancellations_reason_code_fkey;

-- 3. Allow reason_code to be NULL so per-entity-only codes are not forced to match the legacy set
--    and the writer can phase the column out in favour of reason_code_id.
DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'dispatch'
      AND table_name = 'load_cancellations'
      AND column_name = 'reason_code'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE dispatch.load_cancellations ALTER COLUMN reason_code DROP NOT NULL;
  END IF;
END
$mig$;

-- 4. Verification — expect legacy_fk_should_be_0 = 0, reason_code_now_nullable_YES = 'YES',
--    rows_without_canonical_link = 0.
DO $verify$
DECLARE
  v_legacy_fk int;
  v_nullable text;
  v_orphans int;
BEGIN
  SELECT count(*) INTO v_legacy_fk
    FROM pg_constraint WHERE conname = 'load_cancellations_reason_code_fkey';
  SELECT is_nullable INTO v_nullable
    FROM information_schema.columns
   WHERE table_schema = 'dispatch' AND table_name = 'load_cancellations' AND column_name = 'reason_code';
  SELECT count(*) INTO v_orphans
    FROM dispatch.load_cancellations WHERE reason_code_id IS NULL;

  RAISE NOTICE 'LST-F04: legacy_fk=% (expect 0), reason_code_nullable=% (expect YES), rows_without_canonical_link=% (expect 0)',
    v_legacy_fk, v_nullable, v_orphans;

  IF v_legacy_fk <> 0 THEN
    RAISE EXCEPTION 'LST-F04: legacy FK load_cancellations_reason_code_fkey still present';
  END IF;
END
$verify$;

COMMIT;
