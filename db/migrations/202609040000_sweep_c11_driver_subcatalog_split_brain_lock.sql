-- [HOLD-FOR-JORGE — migration touches catalogs.* schema, financial cluster per §1] SWEEP-C11
-- driver sub-catalog split-brain — DB-level write lock (defense-in-depth behind the API-level
-- 410 shipped in the same PR).
--
-- *** DO NOT RUN ON PROD VIA db:migrate. Apply ONLY on a Neon branch by Jorge's hand, then
--     ledger-backfill db/migrations/.held-migrations.json (held -> applied_held). ***
--
-- FINDING (SWEEP-C11, confirmed defect from owner order):
--   /api/v1/catalogs/driver/{license-classes,endorsements,restrictions,medical-card-status,
--   employment-status} (apps/backend/src/lists/driver-catalogs.routes.ts, registered via
--   apps/backend/src/catalogs/driver/factory.ts — PR #403/#406 "A17.2") writes
--   catalogs.{license_classes,cdl_endorsements,cdl_restrictions,medical_card_statuses,
--   employment_statuses}. The canonical /api/v1/lists/drivers/* surface
--   (apps/backend/src/lists/drivers-reference.routes.ts — PR #405 "A17") writes
--   reference.{same 5 table names}. Both surfaces accepted live POST/PATCH/DELETE — the
--   catalogs.* side only carried a "Deprecation" response header, it never actually stopped
--   writes. A row created on one surface was invisible on the other (split-brain), exactly as
--   documented and left open in
--   apps/frontend/src/components/parity/catalogPickerRegistry.ts:196-198 ("READ/WRITE
--   DIVERGENCE ... fails clause 5"). Migration 0340 (2026-06-03) already COMMENT'd these 5
--   catalogs.* tables "DEPRECATED ... Empty in production" but a comment enforces nothing —
--   the write path stayed live for another 7 weeks.
--
-- PROD TRUTH (Rule 10, lucia bypass, re-verified 2026-07-25 on Neon tiny-field-89581227
-- br-fancy-credit-akjnd07a, same-transaction SELECT set_config('app.bypass_rls','lucia',true)):
--   catalogs.license_classes        = 0   reference.license_classes        =  9
--   catalogs.cdl_endorsements       = 0   reference.cdl_endorsements       =  6
--   catalogs.cdl_restrictions       = 0   reference.cdl_restrictions       =  7
--   catalogs.medical_card_statuses  = 0   reference.medical_card_statuses  =  9
--   catalogs.employment_statuses    = 0   reference.employment_statuses    = 11
-- CANONICAL = reference.* (matches the existing A17.2 code decision that already deprecates
-- catalogs.* in favor of reference.* via /lists/drivers/*). All 5 catalogs.* loser tables are
-- STILL ZERO ROWS on prod today — NO BACKFILL IS REQUIRED (verified live, not assumed). No FK
-- anywhere references these 5 catalogs.* tables (pg_constraint cross-check, same date, zero
-- rows returned) — safe to lock without any cascading impact.
--
-- FIX (this migration): a BEFORE INSERT OR UPDATE trigger on each of the 5 catalogs.* loser
-- tables RAISEs, so even a direct-DB writer (script, another service, or future code that
-- bypasses the Fastify API) cannot resurrect the split-brain. This is defense-in-depth: the
-- primary fix is the API-level 410 in apps/backend/src/catalogs/driver/factory.ts
-- (config.deprecation.writesBlocked), shipped in the same PR, wired via
-- apps/backend/src/lists/driver-catalogs.routes.ts.
--
-- Rule 07 (never delete, only add): the 5 tables are ARCHIVED via a locking trigger + a
-- descriptive COMMENT ON TABLE, never DROPped. The (already-zero) rows are untouched — no
-- DELETE, no TRUNCATE, anywhere in this file. GET reads remain fully live (read-only archive).
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS / CREATE TRIGGER; a second
-- apply is a clean no-op. Fresh-DB-safe: every block is to_regclass-guarded, so a DB that has
-- not yet created a given table is a clean no-op instead of an error. No GL math, no posting,
-- no catalogs.accounts touch, no reserve/holdback/retainage account touch (Rule 19 N/A) — this
-- is a driver reference sub-catalog, not a money table. No QBO write-back.
--
-- Written as 5 explicit per-table blocks (not a dynamic-SQL FOREACH loop) so every CREATE
-- FUNCTION / TRIGGER / COMMENT statement is plain, reviewable SQL — no nested dollar-quote or
-- format()-identifier risk.

BEGIN;

-- ===========================================================================================
-- 1) catalogs.license_classes
-- ===========================================================================================
DO $$
BEGIN
  IF to_regclass('catalogs.license_classes') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION catalogs.assert_license_classes_split_brain_locked()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $fn$
      BEGIN
        RAISE EXCEPTION
          'catalogs.license_classes is archived (SWEEP-C11 split-brain fix, 2026-07-25) — canonical store is reference.license_classes via /api/v1/lists/drivers/license-classes. Read-only historical archive; writes must go through the canonical reference.* surface.';
        RETURN NULL;
      END;
      $fn$;

    DROP TRIGGER IF EXISTS trg_license_classes_split_brain_locked ON catalogs.license_classes;
    CREATE TRIGGER trg_license_classes_split_brain_locked
      BEFORE INSERT OR UPDATE ON catalogs.license_classes
      FOR EACH ROW
      EXECUTE FUNCTION catalogs.assert_license_classes_split_brain_locked();

    COMMENT ON TABLE catalogs.license_classes IS
      'ARCHIVED (SWEEP-C11, 2026-07-25) — confirmed split-brain LOSER vs reference.license_classes '
      '(Neon lucia count 2026-07-25: catalogs=0 rows, reference=9 canonical rows). INSERT/UPDATE '
      'permanently blocked by trg_license_classes_split_brain_locked; API returns 410 '
      '(apps/backend/src/catalogs/driver/factory.ts writesBlocked). Read-only history. Never DROP '
      '(Rule 07) — supersedes the 0340 comment (2026-06-03) which only documented, never enforced, '
      'the split.';
  END IF;
END
$$;

-- ===========================================================================================
-- 2) catalogs.cdl_endorsements
-- ===========================================================================================
DO $$
BEGIN
  IF to_regclass('catalogs.cdl_endorsements') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION catalogs.assert_cdl_endorsements_split_brain_locked()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $fn$
      BEGIN
        RAISE EXCEPTION
          'catalogs.cdl_endorsements is archived (SWEEP-C11 split-brain fix, 2026-07-25) — canonical store is reference.cdl_endorsements via /api/v1/lists/drivers/endorsements. Read-only historical archive; writes must go through the canonical reference.* surface.';
        RETURN NULL;
      END;
      $fn$;

    DROP TRIGGER IF EXISTS trg_cdl_endorsements_split_brain_locked ON catalogs.cdl_endorsements;
    CREATE TRIGGER trg_cdl_endorsements_split_brain_locked
      BEFORE INSERT OR UPDATE ON catalogs.cdl_endorsements
      FOR EACH ROW
      EXECUTE FUNCTION catalogs.assert_cdl_endorsements_split_brain_locked();

    COMMENT ON TABLE catalogs.cdl_endorsements IS
      'ARCHIVED (SWEEP-C11, 2026-07-25) — confirmed split-brain LOSER vs reference.cdl_endorsements '
      '(Neon lucia count 2026-07-25: catalogs=0 rows, reference=6 canonical rows). INSERT/UPDATE '
      'permanently blocked by trg_cdl_endorsements_split_brain_locked; API returns 410 '
      '(apps/backend/src/catalogs/driver/factory.ts writesBlocked). Read-only history. Never DROP '
      '(Rule 07) — supersedes the 0340 comment (2026-06-03) which only documented, never enforced, '
      'the split.';
  END IF;
END
$$;

-- ===========================================================================================
-- 3) catalogs.cdl_restrictions
-- ===========================================================================================
DO $$
BEGIN
  IF to_regclass('catalogs.cdl_restrictions') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION catalogs.assert_cdl_restrictions_split_brain_locked()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $fn$
      BEGIN
        RAISE EXCEPTION
          'catalogs.cdl_restrictions is archived (SWEEP-C11 split-brain fix, 2026-07-25) — canonical store is reference.cdl_restrictions via /api/v1/lists/drivers/restrictions. Read-only historical archive; writes must go through the canonical reference.* surface.';
        RETURN NULL;
      END;
      $fn$;

    DROP TRIGGER IF EXISTS trg_cdl_restrictions_split_brain_locked ON catalogs.cdl_restrictions;
    CREATE TRIGGER trg_cdl_restrictions_split_brain_locked
      BEFORE INSERT OR UPDATE ON catalogs.cdl_restrictions
      FOR EACH ROW
      EXECUTE FUNCTION catalogs.assert_cdl_restrictions_split_brain_locked();

    COMMENT ON TABLE catalogs.cdl_restrictions IS
      'ARCHIVED (SWEEP-C11, 2026-07-25) — confirmed split-brain LOSER vs reference.cdl_restrictions '
      '(Neon lucia count 2026-07-25: catalogs=0 rows, reference=7 canonical rows). INSERT/UPDATE '
      'permanently blocked by trg_cdl_restrictions_split_brain_locked; API returns 410 '
      '(apps/backend/src/catalogs/driver/factory.ts writesBlocked). Read-only history. Never DROP '
      '(Rule 07) — supersedes the 0340 comment (2026-06-03) which only documented, never enforced, '
      'the split.';
  END IF;
END
$$;

-- ===========================================================================================
-- 4) catalogs.medical_card_statuses
-- ===========================================================================================
DO $$
BEGIN
  IF to_regclass('catalogs.medical_card_statuses') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION catalogs.assert_medical_card_statuses_split_brain_locked()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $fn$
      BEGIN
        RAISE EXCEPTION
          'catalogs.medical_card_statuses is archived (SWEEP-C11 split-brain fix, 2026-07-25) — canonical store is reference.medical_card_statuses via /api/v1/lists/drivers/medical-card-status. Read-only historical archive; writes must go through the canonical reference.* surface.';
        RETURN NULL;
      END;
      $fn$;

    DROP TRIGGER IF EXISTS trg_medical_card_statuses_split_brain_locked ON catalogs.medical_card_statuses;
    CREATE TRIGGER trg_medical_card_statuses_split_brain_locked
      BEFORE INSERT OR UPDATE ON catalogs.medical_card_statuses
      FOR EACH ROW
      EXECUTE FUNCTION catalogs.assert_medical_card_statuses_split_brain_locked();

    COMMENT ON TABLE catalogs.medical_card_statuses IS
      'ARCHIVED (SWEEP-C11, 2026-07-25) — confirmed split-brain LOSER vs reference.medical_card_statuses '
      '(Neon lucia count 2026-07-25: catalogs=0 rows, reference=9 canonical rows). INSERT/UPDATE '
      'permanently blocked by trg_medical_card_statuses_split_brain_locked; API returns 410 '
      '(apps/backend/src/catalogs/driver/factory.ts writesBlocked). Read-only history. Never DROP '
      '(Rule 07) — supersedes the 0340 comment (2026-06-03) which only documented, never enforced, '
      'the split.';
  END IF;
END
$$;

-- ===========================================================================================
-- 5) catalogs.employment_statuses
-- ===========================================================================================
DO $$
BEGIN
  IF to_regclass('catalogs.employment_statuses') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION catalogs.assert_employment_statuses_split_brain_locked()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $fn$
      BEGIN
        RAISE EXCEPTION
          'catalogs.employment_statuses is archived (SWEEP-C11 split-brain fix, 2026-07-25) — canonical store is reference.employment_statuses via /api/v1/lists/drivers/employment-status. Read-only historical archive; writes must go through the canonical reference.* surface.';
        RETURN NULL;
      END;
      $fn$;

    DROP TRIGGER IF EXISTS trg_employment_statuses_split_brain_locked ON catalogs.employment_statuses;
    CREATE TRIGGER trg_employment_statuses_split_brain_locked
      BEFORE INSERT OR UPDATE ON catalogs.employment_statuses
      FOR EACH ROW
      EXECUTE FUNCTION catalogs.assert_employment_statuses_split_brain_locked();

    COMMENT ON TABLE catalogs.employment_statuses IS
      'ARCHIVED (SWEEP-C11, 2026-07-25) — confirmed split-brain LOSER vs reference.employment_statuses '
      '(Neon lucia count 2026-07-25: catalogs=0 rows, reference=11 canonical rows). INSERT/UPDATE '
      'permanently blocked by trg_employment_statuses_split_brain_locked; API returns 410 '
      '(apps/backend/src/catalogs/driver/factory.ts writesBlocked). Read-only history. Never DROP '
      '(Rule 07) — supersedes the 0340 comment (2026-06-03) which only documented, never enforced, '
      'the split.';
  END IF;
END
$$;

COMMIT;

-- POST-DEPLOY VERIFICATION (run on the Neon branch after apply):
--   -- 1) trigger present + enabled on all 5 tables:
--   SELECT tgrelid::regclass, tgname, tgenabled FROM pg_trigger
--    WHERE tgname LIKE 'trg_%_split_brain_locked' ORDER BY 1;
--   -- expect 5 rows, tgenabled = 'O'.
--
--   -- 2) writes are actually blocked (should raise, then ROLLBACK the probe):
--   BEGIN;
--     INSERT INTO catalogs.license_classes (operating_company_id, code, display_name)
--       VALUES ('00000000-0000-0000-0000-000000000000', 'PROBE', 'probe');  -- expect RAISE EXCEPTION
--   ROLLBACK;
--
--   -- 3) row counts unchanged (still 0; no data was touched by this migration):
--   SELECT 'catalogs.license_classes', count(*) FROM catalogs.license_classes
--   UNION ALL SELECT 'catalogs.cdl_endorsements', count(*) FROM catalogs.cdl_endorsements
--   UNION ALL SELECT 'catalogs.cdl_restrictions', count(*) FROM catalogs.cdl_restrictions
--   UNION ALL SELECT 'catalogs.medical_card_statuses', count(*) FROM catalogs.medical_card_statuses
--   UNION ALL SELECT 'catalogs.employment_statuses', count(*) FROM catalogs.employment_statuses;
--
-- ROLLBACK (additive; forward-only chain otherwise — void-not-delete, so no data is ever
-- destroyed and the tables are never dropped):
--   BEGIN;
--     DROP TRIGGER IF EXISTS trg_license_classes_split_brain_locked ON catalogs.license_classes;
--     DROP TRIGGER IF EXISTS trg_cdl_endorsements_split_brain_locked ON catalogs.cdl_endorsements;
--     DROP TRIGGER IF EXISTS trg_cdl_restrictions_split_brain_locked ON catalogs.cdl_restrictions;
--     DROP TRIGGER IF EXISTS trg_medical_card_statuses_split_brain_locked ON catalogs.medical_card_statuses;
--     DROP TRIGGER IF EXISTS trg_employment_statuses_split_brain_locked ON catalogs.employment_statuses;
--   COMMIT;
