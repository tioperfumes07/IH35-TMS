-- [HOLD-FOR-JORGE — TIER 1] DO NOT RUN ON PROD — run ONLY on a Neon branch by Jorge's hand, then
-- ledger-backfill so prod db:migrate skips it. Registered in db/migrations/.held-migrations.json
-- (verify-hold-migrations-registered + verify-held-registry-ledger-parity enforce this).
--
-- SAF-DOM-02 — finish the company_violations jsonb→FK normalization that 202607820000 started.
--
-- ============================================================================================
-- WHAT ALREADY EXISTS (do not rebuild it) — 202607820000_safety_relational_linkage_and_lifecycle
-- is APPLIED on prod (.held-migrations.json → applied_held, applied_on_prod:true) and already
-- shipped, correctly:
--   • safety.company_violation_drivers / _units / _fines  (all three join tables, incl. the fines
--     one — so there is no "missing fines junction" to add)
--   • FK to org.companies + ON DELETE CASCADE from the violation + implicit NO ACTION on the
--     driver/unit/fine side (a referenced driver cannot be deleted out from under a link)
--   • UNIQUE (violation_id, <entity>_id), forward AND reverse indexes
--   • ENABLE + FORCE ROW LEVEL SECURITY, per-entity policy, 0065-pattern GRANTs
--   • a one-shot jsonb→junction backfill guarded by a 0-orphan RAISE
--   • deprecating COMMENTs on all three jsonb columns
-- 202607840000_revoke_delete_safety_join_tables (also applied) REVOKEd the inherited DELETE.
--
-- WHAT THIS MIGRATION ADDS — the three things that were left unfinished and are the reason the
-- normalization does not actually hold today:
--
--   §1  A RE-BACKFILL SWEEP. 202607820000's backfill was one-shot and ran at apply time. The PATCH
--       handler has kept writing the retired jsonb ever since (SAF-B28), so ids added by an
--       operator edit AFTER that apply exist ONLY in the jsonb and were never mirrored into the
--       join tables. Without this sweep, archiving the jsonb would strand them. Same 0-orphan
--       ABORT contract: an id that will not resolve stops the migration; it is never dropped.
--
--   §2  THE LAST LIVE READER OF THE RETIRED JSONB — and the most expensive finding here.
--       safety.auto_create_internal_fine_from_violation() (0109 → 0123 → 0124, SECURITY DEFINER,
--       fired by trg_auto_fine_on_violation_resolve BEFORE UPDATE OF status, outcome) resolves the
--       driver for the auto-issued internal fine SOLELY from NEW.related_drivers. The CREATE route
--       (company-violations.routes.ts:198-217) writes drivers to the JOIN TABLES and never
--       populates that jsonb. So for every violation created through the UI since 202607820000 was
--       applied, the trigger reads an empty jsonb, hits `IF v_driver_id IS NULL THEN RETURN NEW`,
--       and issues NO FINE — while the resolve endpoint returns HTTP 200 with
--       autoCreatedInternalFineUuid: null. A monetary_fine resolution silently produces no money
--       record. This repoints the driver lookup at safety.company_violation_drivers. Nothing else
--       in the function changes: no new GL math, no posting, no amount logic, no flag.
--
--   §3  ARCHIVE ENFORCEMENT (void-not-delete). "Archived" was only a COMMENT, and a COMMENT does
--       not stop a writer — which is exactly how the PATCH kept writing a column the read path had
--       already abandoned. This adds a BEFORE UPDATE OF trigger that REFUSES any statement that
--       changes one of the three retired jsonb columns. The columns are NOT dropped, NOT cleared
--       and stay readable forever (additive-only / never-delete).
--
-- NOT IN THIS MIGRATION, deliberately:
--   • The PATCH write path (apps/backend/src/safety/company-violations.routes.ts:256-269) — that is
--     SAF-B28, tracked in the C2 lane. Rules of engagement: a coder does not reach into the other
--     lane's file. It is reported, with line numbers, in the PR body instead of silently overlapped.
--   • GET /:id (routes.ts:145-154) still `SELECT *`s the retired jsonb and never returns the
--     junction arrays that the LIST endpoint (:117-123) does. Same file, same lane, same report.
--   • Reverse SURFACES (driver profile → its violations, unit → its violations, fine → its
--     violation). The reverse INDEXES exist and a reverse read is queryable today; no screen
--     consumes it. Named as REMAINING in the PR rather than claimed.
--
-- ⚠⚠ APPLY ORDER — READ BEFORE APPLYING ⚠⚠
--   §3 turns SAF-B28's SILENT no-op into a LOUD error on edit. That is the correct direction
--   (a wrong answer must never be quiet), but it is a live behaviour change for a working carrier:
--   APPLY THIS ONLY AFTER SAF-B28's PATCH repoint is live on prod. §1 and §2 are safe to apply at
--   any time and fix real data/money loss; if the owner wants them sooner, apply this file with §3
--   commented out and re-apply the whole file (it is idempotent) once SAF-B28 lands.
--
-- ============================================================================================
-- VERIFY-FIRST / SOURCES. Every schema fact below was read out of db/migrations on this branch,
-- and out of docs/schema-parity-baseline.json (the committed prod-schema mirror), NOT from memory:
--   • safety.company_violations.related_drivers / related_units / related_fine_ids are jsonb
--     (0050_safety_gaps_fill.sql:62-64), nullable, no default.
--   • safety.company_violation_drivers / _units / _fines and their columns are present in
--     docs/schema-parity-baseline.json.
--   • mdata.units carries owner_company_id / currently_leased_to_company_id and NOT
--     operating_company_id — the unit orphan check below uses the owner/lessee predicate, matching
--     202607820000.
--   • The auto-fine trigger's current body is db/migrations/0124_...:971-1101; the trigger wiring
--     is :1107-1112. 0124 is NOT edited here (never edit an applied migration) — the function is
--     replaced forward with CREATE OR REPLACE.
--   • UNVERIFIED — needs live check: prod ROW COUNTS for safety.company_violations and the three
--     join tables, and therefore how many rows §1 actually sweeps. No prod DB access in this
--     session (§1.5 gate). No row count is asserted anywhere in this file; §1 computes what it
--     needs at apply time and reports it as a NOTICE.
--
-- NO HARDCODED UUID: this migration names no company. Entity scoping is derived per row from
-- safety.company_violations.operating_company_id, which is itself FK'd to org.companies.
-- POSTS NOTHING: no GL, no journal entry, no feature flag, no amount change.
-- NEVER-DELETE: no DROP TABLE, no DROP COLUMN, no DELETE, no TRUNCATE, no UPDATE of existing rows.
-- ============================================================================================

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- §1. RE-BACKFILL SWEEP — jsonb ids written AFTER 202607820000's one-shot backfill.
--
--     0-ORPHAN ABORT FIRST. Every id in the jsonb must resolve to a real row in the SAME entity or
--     this migration stops. Dropping an unresolvable id would convert a data problem into silent
--     data loss, which is the entire reason a jsonb "link" is banned in the first place.
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE
  orphan_drivers int;
  orphan_units   int;
  orphan_fines   int;
BEGIN
  SELECT count(*) INTO orphan_drivers
  FROM safety.company_violations cv
  CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cv.related_drivers, '[]'::jsonb)) AS j(val)
  WHERE j.val ~ '^[0-9a-fA-F-]{36}$'
    AND NOT EXISTS (SELECT 1 FROM mdata.drivers d
                    WHERE d.id = j.val::uuid AND d.operating_company_id = cv.operating_company_id);

  SELECT count(*) INTO orphan_units
  FROM safety.company_violations cv
  CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cv.related_units, '[]'::jsonb)) AS j(val)
  WHERE j.val ~ '^[0-9a-fA-F-]{36}$'
    AND NOT EXISTS (SELECT 1 FROM mdata.units u
                    WHERE u.id = j.val::uuid
                      AND (u.owner_company_id = cv.operating_company_id
                           OR u.currently_leased_to_company_id = cv.operating_company_id));

  SELECT count(*) INTO orphan_fines
  FROM safety.company_violations cv
  CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cv.related_fine_ids, '[]'::jsonb)) AS j(val)
  WHERE j.val ~ '^[0-9a-fA-F-]{36}$'
    AND NOT EXISTS (SELECT 1 FROM safety.civil_fines f
                    WHERE f.id = j.val::uuid AND f.operating_company_id = cv.operating_company_id);

  IF orphan_drivers > 0 OR orphan_units > 0 OR orphan_fines > 0 THEN
    RAISE EXCEPTION
      'SAF-DOM-02 re-backfill ABORTED — unresolvable ids in the retired jsonb: % driver(s), % unit(s), % fine(s). Resolve or record every one of them before migrating; they must not be dropped.',
      orphan_drivers, orphan_units, orphan_fines;
  END IF;
END
$$;

INSERT INTO safety.company_violation_drivers (operating_company_id, violation_id, driver_id)
SELECT cv.operating_company_id, cv.id, j.val::uuid
FROM safety.company_violations cv
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cv.related_drivers, '[]'::jsonb)) AS j(val)
WHERE j.val ~ '^[0-9a-fA-F-]{36}$'
ON CONFLICT (violation_id, driver_id) DO NOTHING;

INSERT INTO safety.company_violation_units (operating_company_id, violation_id, unit_id)
SELECT cv.operating_company_id, cv.id, j.val::uuid
FROM safety.company_violations cv
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cv.related_units, '[]'::jsonb)) AS j(val)
WHERE j.val ~ '^[0-9a-fA-F-]{36}$'
ON CONFLICT (violation_id, unit_id) DO NOTHING;

INSERT INTO safety.company_violation_fines (operating_company_id, violation_id, fine_id)
SELECT cv.operating_company_id, cv.id, j.val::uuid
FROM safety.company_violations cv
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cv.related_fine_ids, '[]'::jsonb)) AS j(val)
WHERE j.val ~ '^[0-9a-fA-F-]{36}$'
ON CONFLICT (violation_id, fine_id) DO NOTHING;

-- Post-sweep proof, emitted as a NOTICE so the apply transcript carries the evidence instead of a
-- claim. Every jsonb id must now have a matching join row; if not, stop.
DO $$
DECLARE unmirrored int;
BEGIN
  SELECT
    (SELECT count(*) FROM safety.company_violations cv
       CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cv.related_drivers, '[]'::jsonb)) AS j(val)
      WHERE j.val ~ '^[0-9a-fA-F-]{36}$'
        AND NOT EXISTS (SELECT 1 FROM safety.company_violation_drivers x
                        WHERE x.violation_id = cv.id AND x.driver_id = j.val::uuid))
  + (SELECT count(*) FROM safety.company_violations cv
       CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cv.related_units, '[]'::jsonb)) AS j(val)
      WHERE j.val ~ '^[0-9a-fA-F-]{36}$'
        AND NOT EXISTS (SELECT 1 FROM safety.company_violation_units x
                        WHERE x.violation_id = cv.id AND x.unit_id = j.val::uuid))
  + (SELECT count(*) FROM safety.company_violations cv
       CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cv.related_fine_ids, '[]'::jsonb)) AS j(val)
      WHERE j.val ~ '^[0-9a-fA-F-]{36}$'
        AND NOT EXISTS (SELECT 1 FROM safety.company_violation_fines x
                        WHERE x.violation_id = cv.id AND x.fine_id = j.val::uuid))
    INTO unmirrored;

  IF unmirrored > 0 THEN
    RAISE EXCEPTION
      'SAF-DOM-02 re-backfill INCOMPLETE — % jsonb id(s) still have no join row after the sweep. Do not archive the columns until every id is mirrored.',
      unmirrored;
  END IF;

  RAISE NOTICE 'SAF-DOM-02 §1: every retired-jsonb id is mirrored into its join table (0 unmirrored). Join rows now: drivers=%, units=%, fines=%',
    (SELECT count(*) FROM safety.company_violation_drivers),
    (SELECT count(*) FROM safety.company_violation_units),
    (SELECT count(*) FROM safety.company_violation_fines);
END
$$;

-- ---------------------------------------------------------------------------------------------
-- §2. Repoint the LAST LIVE READER of the retired jsonb.
--
--     Body is 0124_p6_active_drift_reconciliation.sql:971-1101 verbatim EXCEPT the driver-
--     resolution block, which now reads safety.company_violation_drivers. SECURITY DEFINER, search
--     path, amount resolution, reason-code fallback, the internal_fines INSERT and the
--     auto_created_internal_fine_uuid write are all unchanged — this is a linkage repoint, not a
--     rewrite of fine logic.
--
--     Ordering is deterministic (created_at, id) rather than "array position 0", which the jsonb
--     never actually guaranteed. Single-driver behaviour is preserved on purpose: it matches the
--     singular auto_created_internal_fine_uuid contract. Multi-driver fan-out would be a product
--     decision, not a migration.
--
--     Safe because §1 runs first in the same transaction: the join table is now a strict superset
--     of the jsonb, so no violation can resolve a driver under the old path but not the new one.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION safety.auto_create_internal_fine_from_violation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  v_violation_type_amount INTEGER;
  v_violation_type_code TEXT;
  v_final_amount INTEGER;
  v_new_fine_uuid UUID;
  v_reason_id UUID;
  v_driver_id UUID;
BEGIN
  IF NEW.outcome <> 'monetary_fine' THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'closed' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'closed' AND OLD.outcome = 'monetary_fine' THEN
    RETURN NEW;
  END IF;
  IF NEW.auto_created_internal_fine_uuid IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- SAF-DOM-02: the subject driver comes from the FK join table, never the retired jsonb memo.
  -- The previous body parsed that memo (["<uuid>"] / [{"id":...}] / {...}); the create route
  -- stopped populating the column when 202607820000 landed, so the lookup returned NULL and the
  -- fine was silently skipped. No literal reference to the retired column survives in this body —
  -- POST-APPLY VERIFY #2 below greps prosrc and must read t | f.
  SELECT cvd.driver_id
    INTO v_driver_id
  FROM safety.company_violation_drivers cvd
  WHERE cvd.violation_id = NEW.id
    AND cvd.operating_company_id = NEW.operating_company_id
    AND cvd.is_active
  ORDER BY cvd.created_at, cvd.id
  LIMIT 1;

  IF v_driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT cvt.amount_cents, cvt.type_code
    INTO v_violation_type_amount, v_violation_type_code
  FROM catalogs.company_violation_types cvt
  WHERE cvt.id = COALESCE(NEW.violation_type_uuid, NEW.violation_type_id)
  LIMIT 1;

  IF v_violation_type_code IS NULL THEN
    SELECT cvt.amount_cents, cvt.type_code
      INTO v_violation_type_amount, v_violation_type_code
    FROM catalogs.company_violation_types cvt
    WHERE cvt.operating_company_id = NEW.operating_company_id
      AND cvt.type_code = COALESCE(NEW.violation_type, '')
    LIMIT 1;
  END IF;

  v_final_amount := COALESCE(NEW.fine_amount_cents_override, v_violation_type_amount);
  IF v_final_amount IS NULL OR v_final_amount <= 0 THEN
    RAISE EXCEPTION 'E_VIOLATION_AMOUNT_REQUIRED: violation has no catalog amount and no override';
  END IF;

  SELECT id INTO v_reason_id
  FROM catalogs.internal_fine_reasons
  WHERE operating_company_id = NEW.operating_company_id
    AND reason_code = COALESCE(v_violation_type_code, 'GOVERNOR-OVERRIDE')
  LIMIT 1;

  IF v_reason_id IS NULL THEN
    INSERT INTO catalogs.internal_fine_reasons (
      operating_company_id, reason_code, reason_name, default_amount, is_active
    )
    VALUES (
      NEW.operating_company_id,
      COALESCE(v_violation_type_code, 'AUTO-COMPANY-VIOLATION'),
      COALESCE(v_violation_type_code, 'Auto company violation'),
      ROUND(v_final_amount::numeric / 100, 2),
      TRUE
    )
    RETURNING id INTO v_reason_id;
  END IF;

  INSERT INTO safety.internal_fines (
    id,
    operating_company_id,
    driver_id,
    reason_id,
    amount,
    imposed_date,
    imposed_by_user_id,
    approved_by_user_id,
    status,
    notes,
    created_at
  ) VALUES (
    gen_random_uuid(),
    NEW.operating_company_id,
    v_driver_id,
    v_reason_id,
    ROUND(v_final_amount::numeric / 100, 2),
    CURRENT_DATE,
    NEW.updated_by_user_id,
    NEW.updated_by_user_id,
    'approved',
    'Auto-issued from company violation: ' || COALESCE(v_violation_type_code, 'unknown'),
    now()
  )
  RETURNING id INTO v_new_fine_uuid;

  NEW.auto_created_internal_fine_uuid := v_new_fine_uuid;
  RETURN NEW;
END;
$func$;

-- Re-assert the wiring idempotently. Same name, same timing, same WHEN clause as 0124:1107-1112 —
-- restated so this file is self-sufficient on a fresh DB and cannot depend on trigger state drift.
DROP TRIGGER IF EXISTS trg_auto_fine_on_violation_resolve ON safety.company_violations;
CREATE TRIGGER trg_auto_fine_on_violation_resolve
  BEFORE UPDATE OF status, outcome ON safety.company_violations
  FOR EACH ROW
  WHEN (NEW.status = 'closed' AND NEW.outcome = 'monetary_fine')
  EXECUTE FUNCTION safety.auto_create_internal_fine_from_violation();

-- ---------------------------------------------------------------------------------------------
-- §3. ARCHIVE ENFORCEMENT — stop-writing, enforced by the database rather than by a COMMENT.
--
--     void-not-delete: the columns are kept, kept readable, and never cleared. What changes is
--     that a WRITE to them is refused, so the class of bug that produced SAF-DOM-02 (a writer
--     still filling a column the reader has abandoned, with no error anywhere) cannot recur.
--
--     BEFORE UPDATE **OF** the three columns: the trigger is only considered when a statement
--     actually lists one of them in its SET clause, and it still only raises when the value
--     genuinely changes (IS DISTINCT FROM), so an idempotent rewrite of the same value is not
--     punished. INSERTs are untouched — nothing inserts these columns today, and a future INSERT
--     of NULL/'[]' is harmless.
--
--     ERRCODE 0A000 (feature_not_supported) is deliberate: it is not a constraint violation and
--     must not be retried or swallowed as one.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION safety.reject_retired_company_violation_jsonb()
RETURNS TRIGGER LANGUAGE plpgsql AS $func$
BEGIN
  IF NEW.related_drivers IS DISTINCT FROM OLD.related_drivers THEN
    RAISE EXCEPTION
      'SAF-DOM-02: safety.company_violations.related_drivers is RETIRED and read-only. Write safety.company_violation_drivers (violation_id, driver_id) instead — the jsonb has no FK, no reverse read, and is no longer read by anything.'
      USING ERRCODE = '0A000';
  END IF;

  IF NEW.related_units IS DISTINCT FROM OLD.related_units THEN
    RAISE EXCEPTION
      'SAF-DOM-02: safety.company_violations.related_units is RETIRED and read-only. Write safety.company_violation_units (violation_id, unit_id) instead.'
      USING ERRCODE = '0A000';
  END IF;

  IF NEW.related_fine_ids IS DISTINCT FROM OLD.related_fine_ids THEN
    RAISE EXCEPTION
      'SAF-DOM-02: safety.company_violations.related_fine_ids is RETIRED and read-only. Write safety.company_violation_fines (violation_id, fine_id) instead.'
      USING ERRCODE = '0A000';
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_reject_retired_cv_jsonb ON safety.company_violations;
CREATE TRIGGER trg_reject_retired_cv_jsonb
  BEFORE UPDATE OF related_drivers, related_units, related_fine_ids
  ON safety.company_violations
  FOR EACH ROW
  EXECUTE FUNCTION safety.reject_retired_company_violation_jsonb();

-- ---------------------------------------------------------------------------------------------
-- §4. Re-assert the archive metadata and the join-table hardening.
--     All idempotent and all already true on prod via 202607820000 + 202607840000. Restated so
--     this file stands alone on a fresh DB and so grant/RLS drift on any one of the three tables
--     is corrected rather than assumed. This ADDS no privilege — it only removes DELETE and
--     re-affirms the 0065 read/write set.
-- ---------------------------------------------------------------------------------------------
COMMENT ON COLUMN safety.company_violations.related_drivers IS
  'RETIRED (SAF-F29 2026-07-24, ENFORCED SAF-DOM-02). Superseded by safety.company_violation_drivers. '
  'Kept for history (additive-only, never dropped, never cleared) and now READ-ONLY: '
  'trg_reject_retired_cv_jsonb refuses any UPDATE that changes it. Do not reintroduce a jsonb id array as a link.';
COMMENT ON COLUMN safety.company_violations.related_units IS
  'RETIRED (SAF-F29 2026-07-24, ENFORCED SAF-DOM-02). Superseded by safety.company_violation_units. '
  'Kept for history and READ-ONLY via trg_reject_retired_cv_jsonb.';
COMMENT ON COLUMN safety.company_violations.related_fine_ids IS
  'RETIRED (SAF-F29 2026-07-24, ENFORCED SAF-DOM-02). Superseded by safety.company_violation_fines. '
  'Kept for history and READ-ONLY via trg_reject_retired_cv_jsonb.';

ALTER TABLE safety.company_violation_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.company_violation_units   ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.company_violation_fines   ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.company_violation_drivers FORCE ROW LEVEL SECURITY;
ALTER TABLE safety.company_violation_units   FORCE ROW LEVEL SECURITY;
ALTER TABLE safety.company_violation_fines   FORCE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    RAISE NOTICE 'SAF-DOM-02 §4: role ih35_app is absent (local/throwaway DB) — grant re-assert skipped.';
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY['company_violation_drivers','company_violation_units','company_violation_fines']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON safety.%I TO ih35_app', t);
    -- Never-delete: these link rows retire via is_active. DELETE is revoked, not granted, and the
    -- safety schema's DEFAULT PRIVILEGES hand out arwd — so the REVOKE has to be explicit.
    EXECUTE format('REVOKE DELETE ON safety.%I FROM ih35_app', t);
  END LOOP;
END
$$;

COMMIT;

-- ===========================================================================================
-- POST-APPLY VERIFY (by hand on the Neon branch; NOT part of the migration)
-- ===========================================================================================
--  -- 1. 0 unmirrored jsonb ids (the acceptance for §1) — must be 0,0,0
--  SELECT
--    (SELECT count(*) FROM safety.company_violations cv
--       CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cv.related_drivers,'[]'::jsonb)) j(val)
--      WHERE j.val ~ '^[0-9a-fA-F-]{36}$'
--        AND NOT EXISTS (SELECT 1 FROM safety.company_violation_drivers x
--                        WHERE x.violation_id=cv.id AND x.driver_id=j.val::uuid)) AS unmirrored_drivers,
--    (SELECT count(*) FROM safety.company_violations cv
--       CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cv.related_units,'[]'::jsonb)) j(val)
--      WHERE j.val ~ '^[0-9a-fA-F-]{36}$'
--        AND NOT EXISTS (SELECT 1 FROM safety.company_violation_units x
--                        WHERE x.violation_id=cv.id AND x.unit_id=j.val::uuid)) AS unmirrored_units,
--    (SELECT count(*) FROM safety.company_violations cv
--       CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cv.related_fine_ids,'[]'::jsonb)) j(val)
--      WHERE j.val ~ '^[0-9a-fA-F-]{36}$'
--        AND NOT EXISTS (SELECT 1 FROM safety.company_violation_fines x
--                        WHERE x.violation_id=cv.id AND x.fine_id=j.val::uuid)) AS unmirrored_fines;
--
--  -- 2. the auto-fine function now reads the join table, not the jsonb
--  SELECT position('company_violation_drivers' in prosrc) > 0 AS reads_join_table,
--         position('related_drivers'          in prosrc) > 0 AS still_reads_jsonb
--    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='safety' AND p.proname='auto_create_internal_fine_from_violation';
--  -- expect t | f
--
--  -- 3. both triggers wired on safety.company_violations
--  SELECT tgname, tgenabled FROM pg_trigger
--   WHERE tgrelid='safety.company_violations'::regclass AND NOT tgisinternal ORDER BY tgname;
--  -- expect trg_auto_fine_on_violation_resolve + trg_reject_retired_cv_jsonb, both 'O'
--
--  -- 4. the archive actually refuses a write (run inside a ROLLBACK-ed txn on a violation row)
--  --   BEGIN;
--  --   UPDATE safety.company_violations SET related_drivers='["00000000-0000-0000-0000-000000000000"]'::jsonb
--  --    WHERE id = <any violation id>;   -- expect ERROR 0A000 SAF-DOM-02 ... RETIRED and read-only
--  --   ROLLBACK;
--
--  -- 5. grants: INSERT,SELECT,UPDATE and NO DELETE
--  SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type)
--    FROM information_schema.role_table_grants
--   WHERE table_schema='safety' AND grantee='ih35_app' AND table_name LIKE 'company_violation_%'
--   GROUP BY table_name;
--
-- DOWN (manual rollback — restores prior behaviour without deleting anything):
--   DROP TRIGGER IF EXISTS trg_reject_retired_cv_jsonb ON safety.company_violations;
--   DROP FUNCTION IF EXISTS safety.reject_retired_company_violation_jsonb();
--   -- then re-apply the 0124 body of safety.auto_create_internal_fine_from_violation() verbatim.
--   -- The §1 join rows are intentionally NOT removed: they are the corrected data.
