-- 202608040000_payment_terms_consumer_remap_same_entity.sql
--
-- HELD — DO NOT RUN ON PROD. Owner Neon-applies + ledger-backfills. Registered in .held-migrations.json.
--
-- LST-F03 follow-up — after 202608000000 clones payment_terms per entity, consumers that still
-- point at a foreign-entity terms UUID will fail company_scope JOINs (detail_types-class trap).
-- Remap mdata.customers / mdata.vendors / accounting.invoices.payment_terms_id to the same-entity
-- clone matched by terms_name. Dynamic org.companies — NO hardcoded UUID.
--
-- PREREQ: 202608000000_payment_terms_posting_templates_per_entity.sql (opco column + seed).
-- Idempotent: only updates rows where pointed terms.opco <> consumer.opco AND a same-name clone exists.
-- NEVER-DELETE (§F.24).

BEGIN;
SELECT set_config('app.bypass_rls', 'lucia', true);

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'catalogs' AND table_name = 'payment_terms'
       AND column_name = 'operating_company_id'
  ) THEN
    RAISE EXCEPTION
      'payment_terms_consumer_remap: catalogs.payment_terms.operating_company_id missing — apply 202608000000 first';
  END IF;

  -- customers
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'mdata' AND table_name = 'customers'
       AND column_name = 'payment_terms_id'
  ) THEN
    UPDATE mdata.customers c
       SET payment_terms_id = tgt.id
      FROM catalogs.payment_terms src
      JOIN catalogs.payment_terms tgt
        ON tgt.operating_company_id = c.operating_company_id
       AND tgt.terms_name = src.terms_name
     WHERE c.payment_terms_id IS NOT NULL
       AND src.id = c.payment_terms_id
       AND src.operating_company_id IS DISTINCT FROM c.operating_company_id;
  END IF;

  -- vendors
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'mdata' AND table_name = 'vendors'
       AND column_name = 'payment_terms_id'
  ) THEN
    UPDATE mdata.vendors v
       SET payment_terms_id = tgt.id
      FROM catalogs.payment_terms src
      JOIN catalogs.payment_terms tgt
        ON tgt.operating_company_id = v.operating_company_id
       AND tgt.terms_name = src.terms_name
     WHERE v.payment_terms_id IS NOT NULL
       AND src.id = v.payment_terms_id
       AND src.operating_company_id IS DISTINCT FROM v.operating_company_id;
  END IF;

  -- invoices (optional column)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'accounting' AND table_name = 'invoices'
       AND column_name = 'payment_terms_id'
  ) THEN
    UPDATE accounting.invoices i
       SET payment_terms_id = tgt.id
      FROM catalogs.payment_terms src
      JOIN catalogs.payment_terms tgt
        ON tgt.operating_company_id = i.operating_company_id
       AND tgt.terms_name = src.terms_name
     WHERE i.payment_terms_id IS NOT NULL
       AND src.id = i.payment_terms_id
       AND src.operating_company_id IS DISTINCT FROM i.operating_company_id;
  END IF;
END
$mig$;

COMMIT;
