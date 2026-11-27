-- SCENTSX company facts (owner 2026-11-26 21:24 CT): "51-0538798, end 12-31, formed 04/01/2005".
--
-- The ScentsX LLC row (202616820200) left the EIN NULL until the owner gave it (design D1). He gave it now, with the
-- fiscal year end and the formation date. org.companies has no place for the last two, so two nullable columns are
-- added; every other company keeps NULL (nothing is guessed for USMCA / TRK / TRANSP).
--   tax_id          '51-0538798'  (EIN, NN-NNNNNNN)
--   fiscal_year_end '12-31'       (MM-DD; the fiscal year is the calendar year)
--   formed_on       2005-04-01
-- No money row, no period, no account is written. Idempotent; on a database without the SCENTSX row the UPDATE is a
-- no-op (proof is the live row after apply).

BEGIN;

ALTER TABLE org.companies ADD COLUMN IF NOT EXISTS fiscal_year_end text;
ALTER TABLE org.companies ADD COLUMN IF NOT EXISTS formed_on date;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_fiscal_year_end_mmdd') THEN
    ALTER TABLE org.companies ADD CONSTRAINT companies_fiscal_year_end_mmdd
      CHECK (fiscal_year_end IS NULL OR fiscal_year_end ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');
  END IF;
END $$;

UPDATE org.companies
   SET tax_id = '51-0538798', fiscal_year_end = '12-31', formed_on = DATE '2005-04-01', updated_at = now()
 WHERE code = 'SCENTSX'
   AND (tax_id IS DISTINCT FROM '51-0538798' OR fiscal_year_end IS DISTINCT FROM '12-31' OR formed_on IS DISTINCT FROM DATE '2005-04-01');

COMMIT;
