-- P44 Lists Wave A — finish canonical load-cancellation reason integrity.
BEGIN;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'load_cancellation_reasons_id_company_uniq') THEN
    ALTER TABLE catalogs.load_cancellation_reasons
      ADD CONSTRAINT load_cancellation_reasons_id_company_uniq UNIQUE (id, operating_company_id);
  END IF;
END
$migration$;

DO $verify_existing$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM dispatch.load_cancellations lc
    LEFT JOIN catalogs.load_cancellation_reasons r
      ON r.id = lc.reason_code_id
     AND r.operating_company_id = lc.operating_company_id
    WHERE lc.reason_code_id IS NULL OR r.id IS NULL
  ) THEN
    RAISE EXCEPTION 'P44 cancellation reasons: NULL or cross-company canonical links remain';
  END IF;
END
$verify_existing$;

ALTER TABLE dispatch.load_cancellations
  DROP CONSTRAINT IF EXISTS load_cancellations_reason_code_id_fkey;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'load_cancellations_reason_company_fk') THEN
    ALTER TABLE dispatch.load_cancellations
      ADD CONSTRAINT load_cancellations_reason_company_fk
      FOREIGN KEY (reason_code_id, operating_company_id)
      REFERENCES catalogs.load_cancellation_reasons(id, operating_company_id);
  END IF;
END
$migration$;

ALTER TABLE dispatch.load_cancellations
  ALTER COLUMN reason_code_id SET NOT NULL;

DO $verify$
DECLARE
  v_nullable text;
BEGIN
  SELECT is_nullable INTO v_nullable
  FROM information_schema.columns
  WHERE table_schema = 'dispatch' AND table_name = 'load_cancellations' AND column_name = 'reason_code_id';
  IF v_nullable <> 'NO' OR NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'load_cancellations_reason_company_fk'
  ) THEN
    RAISE EXCEPTION 'P44 cancellation reasons: NOT NULL or same-opco FK missing';
  END IF;
END
$verify$;

COMMIT;
