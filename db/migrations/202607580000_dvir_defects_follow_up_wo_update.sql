-- 0441-mod2-dvir-followup-wo-wrong-table
-- Unlock set-once UPDATE of safety.dvir_defects.follow_up_wo_id for triage convert-to-WO.
--
-- Context: migration 0344 made dvir_defects fully append-only (UPDATE/DELETE blocked). The
-- per-defect follow_up_wo_id column exists and is read by maintenance defects triage, but
-- the convert-to-WO path could never write it (trigger raises; grant was revoked). Writing
-- to safety.dvir_submissions.follow_up_wo_id instead was the wrong table (one submission,
-- many defects).
--
-- This migration keeps defects append-only for all columns EXCEPT follow_up_wo_id, which
-- may be set once (NULL → value) and never cleared or overwritten. DELETE remains blocked.
-- Additive / idempotent. No financial/accounting tables touched.
--
-- OWNER Neon-apply required (DDL). Build-and-HOLD until applied + live-proven.

BEGIN;

CREATE OR REPLACE FUNCTION safety.block_dvir_defects_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'safety.dvir_defects is append-only — DELETE is not allowed';
  END IF;

  -- UPDATE: only follow_up_wo_id may change (triage convert-to-WO linkage).
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.operating_company_id IS DISTINCT FROM OLD.operating_company_id
     OR NEW.dvir_submission_id IS DISTINCT FROM OLD.dvir_submission_id
     OR NEW.unit_id IS DISTINCT FROM OLD.unit_id
     OR NEW.item_key IS DISTINCT FROM OLD.item_key
     OR NEW.severity IS DISTINCT FROM OLD.severity
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.photo_keys IS DISTINCT FROM OLD.photo_keys
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
     OR NEW.major_defect_code IS DISTINCT FROM OLD.major_defect_code
  THEN
    RAISE EXCEPTION 'safety.dvir_defects is append-only — only follow_up_wo_id may be updated';
  END IF;

  -- Set-once: NULL → value only; never clear or overwrite an existing WO link.
  IF OLD.follow_up_wo_id IS NOT NULL
     AND NEW.follow_up_wo_id IS DISTINCT FROM OLD.follow_up_wo_id THEN
    RAISE EXCEPTION 'safety.dvir_defects.follow_up_wo_id is immutable once set';
  END IF;

  RETURN NEW;
END;
$$;

-- Column-level UPDATE so ih35_app can write the WO linkage without broad mutation.
GRANT UPDATE (follow_up_wo_id) ON safety.dvir_defects TO ih35_app;

COMMENT ON COLUMN safety.dvir_defects.follow_up_wo_id IS
  'Per-defect follow-up work order. Set-once via UPDATE (NULL→value) after migration 202607580000; all other defect columns remain append-only.';

COMMIT;
