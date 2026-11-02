-- ENG-60 (register; LEAD 443.332, owner 10-24): lawsuits live ONLY in Legal as legal.matters type 'lawsuit'.
-- insurance.lawsuit was a second system for the same fact. Its only rows were coder test fixtures (purged AUTH-465);
-- measured live 2026-11-02 CT (all entities, RLS bypassed): insurance.lawsuit = 0 rows,
-- legal.matters.insurance_lawsuit_id NOT NULL = 0, insurance.claim.lawsuit_id NOT NULL = 0.
-- No view, function or user trigger depends on the table (pg_depend / pg_proc / pg_trigger checked).
--
-- Retires, in dependency order:
--   1. legal.matters.insurance_lawsuit_id  (+ FK matters_insurance_lawsuit_id_fkey) — a lawsuit IS the matter; the link
--      pointed a matter at a retired table (and the picker had been retargeted to matters, so it could never save).
--   2. insurance.claim.lawsuit_id          (+ FK claim_lawsuit_id_fkey) — claim -> lawsuit is DERIVED from
--      legal.matters.insurance_claim_id + type 'lawsuit' (store once, derive the rest).
--   3. insurance.lawsuit itself.
-- REFUSES (raises, whole migration rolls back) if any row or link exists in ANY entity — nothing is deleted here.
-- No CASCADE anywhere: an unexpected dependency fails this migration loudly instead of being dropped silently.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL app.bypass_rls = 'lucia';

DO $$
DECLARE
  n_lawsuit bigint := 0;
  n_matter_links bigint := 0;
  n_claim_links bigint := 0;
BEGIN
  IF to_regclass('insurance.lawsuit') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM insurance.lawsuit' INTO n_lawsuit;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'legal' AND table_name = 'matters' AND column_name = 'insurance_lawsuit_id') THEN
    EXECUTE 'SELECT count(*) FROM legal.matters WHERE insurance_lawsuit_id IS NOT NULL' INTO n_matter_links;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'insurance' AND table_name = 'claim' AND column_name = 'lawsuit_id') THEN
    EXECUTE 'SELECT count(*) FROM insurance.claim WHERE lawsuit_id IS NOT NULL' INTO n_claim_links;
  END IF;
  IF n_lawsuit > 0 OR n_matter_links > 0 OR n_claim_links > 0 THEN
    RAISE EXCEPTION 'ENG-60 REFUSED: insurance.lawsuit rows=% , legal.matters.insurance_lawsuit_id links=% , insurance.claim.lawsuit_id links=% — move each to a legal matter first; nothing dropped',
      n_lawsuit, n_matter_links, n_claim_links;
  END IF;
END
$$;

ALTER TABLE legal.matters   DROP CONSTRAINT IF EXISTS matters_insurance_lawsuit_id_fkey;
ALTER TABLE legal.matters   DROP COLUMN IF EXISTS insurance_lawsuit_id;
ALTER TABLE insurance.claim DROP CONSTRAINT IF EXISTS claim_lawsuit_id_fkey;
ALTER TABLE insurance.claim DROP COLUMN IF EXISTS lawsuit_id;
DROP TABLE IF EXISTS insurance.lawsuit;

DO $$
BEGIN
  IF to_regclass('insurance.lawsuit') IS NOT NULL THEN
    RAISE EXCEPTION 'ENG-60: insurance.lawsuit still exists after drop';
  END IF;
END
$$;

COMMIT;
