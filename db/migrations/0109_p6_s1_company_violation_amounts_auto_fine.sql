BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'catalogs'
      AND table_name = 'company_violation_types'
      AND column_name = 'amount_cents'
  ) THEN
    ALTER TABLE catalogs.company_violation_types
      ADD COLUMN amount_cents INTEGER NULL
      CHECK (amount_cents IS NULL OR amount_cents > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'catalogs'
      AND table_name = 'company_violation_types'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE catalogs.company_violation_types
      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

UPDATE catalogs.company_violation_types SET amount_cents = 20000
WHERE type_code = 'DRIVE-WITHOUT-PERMISSION' AND amount_cents IS NULL;
UPDATE catalogs.company_violation_types SET amount_cents = 10000
WHERE type_code = 'PERSONAL-USE-NO-AUTH' AND amount_cents IS NULL;
UPDATE catalogs.company_violation_types SET amount_cents = 7500
WHERE type_code = 'UNAUTH-PASSENGER' AND amount_cents IS NULL;
UPDATE catalogs.company_violation_types SET amount_cents = 12500
WHERE type_code = 'HOS-POLICY-VIOLATION' AND amount_cents IS NULL;
UPDATE catalogs.company_violation_types SET amount_cents = 25000
WHERE type_code = 'GOVERNOR-OVERRIDE' AND amount_cents IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'safety'
      AND table_name = 'company_violations'
      AND column_name = 'fine_amount_cents_override'
  ) THEN
    ALTER TABLE safety.company_violations
      ADD COLUMN fine_amount_cents_override INTEGER NULL
      CHECK (fine_amount_cents_override IS NULL OR fine_amount_cents_override > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'safety'
      AND table_name = 'company_violations'
      AND column_name = 'auto_created_internal_fine_uuid'
  ) THEN
    ALTER TABLE safety.company_violations
      ADD COLUMN auto_created_internal_fine_uuid uuid NULL
      REFERENCES safety.internal_fines(id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION safety.auto_create_internal_fine_from_violation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $func$
DECLARE
  v_violation_type_amount INTEGER;
  v_violation_type_code TEXT;
  v_final_amount INTEGER;
  v_new_fine_uuid UUID;
  v_reason_id UUID;
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
    NEW.driver_id,
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

DROP TRIGGER IF EXISTS trg_auto_fine_on_violation_resolve ON safety.company_violations;
CREATE TRIGGER trg_auto_fine_on_violation_resolve
  BEFORE UPDATE OF status, outcome ON safety.company_violations
  FOR EACH ROW
  WHEN (NEW.status = 'closed' AND NEW.outcome = 'monetary_fine')
  EXECUTE FUNCTION safety.auto_create_internal_fine_from_violation();

COMMIT;
