-- SETL-PICK-01 — auto_deduction_policies.deduction_type must reference catalogs.driver_deduction_types.
-- Replaces the private CHECK enum with a same-company composite FK so Lists edits stay authoritative.
-- Pure DDL: fails closed if any existing row lacks a matching catalog code (no silent remap).

BEGIN;

DO $$
DECLARE
  v_check_name text;
  v_dangling bigint;
BEGIN
  IF to_regclass('driver_finance.auto_deduction_policies') IS NULL THEN
    RAISE NOTICE 'SETL-PICK-01: auto_deduction_policies absent — skip';
    RETURN;
  END IF;
  IF to_regclass('catalogs.driver_deduction_types') IS NULL THEN
    RAISE EXCEPTION 'SETL-PICK-01 ABORT: catalogs.driver_deduction_types is absent';
  END IF;

  SELECT c.conname INTO v_check_name
  FROM pg_constraint c
  WHERE c.conrelid = 'driver_finance.auto_deduction_policies'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%deduction_type%'
  LIMIT 1;
  IF v_check_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE driver_finance.auto_deduction_policies DROP CONSTRAINT %I',
      v_check_name
    );
  END IF;

  SELECT COUNT(*) INTO v_dangling
  FROM driver_finance.auto_deduction_policies p
  WHERE NOT EXISTS (
    SELECT 1
    FROM catalogs.driver_deduction_types t
    WHERE t.operating_company_id = p.operating_company_id
      AND t.code = p.deduction_type
  );
  IF v_dangling > 0 THEN
    RAISE EXCEPTION 'SETL-PICK-01 ABORT: % auto_deduction_policies row(s) lack a same-company driver_deduction_types catalog row — remap legacy deduction_type values before applying this FK', v_dangling;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'driver_finance.auto_deduction_policies'::regclass
      AND conname = 'auto_deduction_policies_deduction_type_catalog_fkey'
  ) THEN
    ALTER TABLE driver_finance.auto_deduction_policies
      ADD CONSTRAINT auto_deduction_policies_deduction_type_catalog_fkey
      FOREIGN KEY (operating_company_id, deduction_type)
      REFERENCES catalogs.driver_deduction_types (operating_company_id, code)
      ON UPDATE RESTRICT
      ON DELETE RESTRICT;
  END IF;
END
$$;

COMMIT;
