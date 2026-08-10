-- Gate-B sample-document purge predicate (LV-LIST-SAMPLE-TAG-IN-NAME-ONLY).
--
-- Returns every Gate-B sample row across the five document families (invoices,
-- payments, bill_payments, bills, journal_entries, expenses, settlement_lines,
-- driver_settlements, catalog accounts/items, and mdata master-data rows) using a
-- single, tag-aware predicate. Real rows are excluded by construction: a row is
-- returned only when it carries the canonical Gate-B free-text tag OR its
-- structured is_sample_data flag is true.
--
-- Usage:
--   SET LOCAL app.bypass_rls = 'lucia';
--   SELECT * FROM (
--     ... paste this CTE block ...
--   ) samples
--   WHERE operating_company_id = '...'::uuid;
--
-- Canonical Gate-B free-text marker. The date suffix matches the day the sample
-- was generated; purge code should use `USMCA_GATEB_SAMPLE_%` to catch all dates.
-- The legacy `CASCADE-GATEB-%` bill_number pattern is included only for bills,
-- because that was the marker the first Gate-B bill actually carried.

WITH gate_b_samples AS (
  SELECT
    'accounting.invoices'::text AS table_name,
    id::text AS entity_id,
    display_id,
    operating_company_id,
    internal_notes AS marker_location,
    'invoice'::text AS entity_kind
  FROM accounting.invoices
  WHERE internal_notes ILIKE '%USMCA_GATEB_SAMPLE_%'
     OR (is_sample_data IS TRUE)

  UNION ALL

  SELECT
    'accounting.payments',
    id::text,
    display_id,
    operating_company_id,
    reference,
    'payment'
  FROM accounting.payments
  WHERE reference ILIKE '%USMCA_GATEB_SAMPLE_%'
     OR (is_sample_data IS TRUE)

  UNION ALL

  SELECT
    'accounting.bill_payments',
    id::text,
    display_id,
    operating_company_id,
    memo,
    'bill_payment'
  FROM accounting.bill_payments
  WHERE memo ILIKE '%USMCA_GATEB_SAMPLE_%'
     OR (is_sample_data IS TRUE)

  UNION ALL

  SELECT
    'accounting.bills',
    id::text,
    display_id,
    operating_company_id,
    COALESCE(memo, bill_number),
    'bill'
  FROM accounting.bills
  WHERE memo ILIKE '%USMCA_GATEB_SAMPLE_%'
     OR bill_number ILIKE 'CASCADE-GATEB-%'
     OR (is_sample_data IS TRUE)

  UNION ALL

  SELECT
    'accounting.journal_entries',
    id::text,
    display_id,
    operating_company_id,
    COALESCE(description, memo),
    'journal_entry'
  FROM accounting.journal_entries
  WHERE COALESCE(description, memo) ILIKE '%USMCA_GATEB_SAMPLE_%'
     OR (is_sample_data IS TRUE)

  UNION ALL

  SELECT
    'accounting.expenses',
    id::text,
    display_id,
    operating_company_id,
    memo,
    'expense'
  FROM accounting.expenses
  WHERE memo ILIKE '%USMCA_GATEB_SAMPLE_%'
     OR (is_sample_data IS TRUE)

  UNION ALL

  SELECT
    'driver_finance.settlement_lines',
    id::text,
    NULL,
    operating_company_id,
    description,
    'settlement_line'
  FROM driver_finance.settlement_lines
  WHERE description ILIKE '%USMCA_GATEB_SAMPLE_%'
     OR (is_sample_data IS TRUE)

  UNION ALL

  SELECT
    'driver_finance.driver_settlements',
    id::text,
    display_id,
    operating_company_id,
    NULL,
    'driver_settlement'
  FROM driver_finance.driver_settlements
  WHERE (is_sample_data IS TRUE)

  UNION ALL

  SELECT
    'catalogs.accounts',
    id::text,
    account_code::text,
    operating_company_id,
    notes,
    'catalog_account'
  FROM catalogs.accounts
  WHERE notes ILIKE '%USMCA_GATEB_SAMPLE_%'
     OR account_name ILIKE '%USMCA_GATEB_SAMPLE_%'

  UNION ALL

  SELECT
    'catalogs.items',
    id::text,
    item_code::text,
    operating_company_id,
    description,
    'catalog_item'
  FROM catalogs.items
  WHERE description ILIKE '%USMCA_GATEB_SAMPLE_%'
     OR item_name ILIKE '%USMCA_GATEB_SAMPLE_%'

  UNION ALL

  SELECT
    'mdata.customers',
    id::text,
    display_id,
    operating_company_id,
    NULL,
    'customer'
  FROM mdata.customers
  WHERE (is_sample_data IS TRUE)

  UNION ALL

  SELECT
    'mdata.vendors',
    id::text,
    display_id,
    operating_company_id,
    NULL,
    'vendor'
  FROM mdata.vendors
  WHERE (is_sample_data IS TRUE)

  UNION ALL

  SELECT
    'mdata.drivers',
    id::text,
    display_id,
    operating_company_id,
    NULL,
    'driver'
  FROM mdata.drivers
  WHERE (is_sample_data IS TRUE)

  UNION ALL

  SELECT
    'mdata.units',
    id::text,
    unit_number,
    operating_company_id,
    NULL,
    'unit'
  FROM mdata.units
  WHERE (is_sample_data IS TRUE)

  UNION ALL

  SELECT
    'mdata.loads',
    id::text,
    load_number,
    operating_company_id,
    NULL,
    'load'
  FROM mdata.loads
  WHERE (is_sample_data IS TRUE)
)
SELECT *
FROM gate_b_samples
ORDER BY operating_company_id, entity_kind, entity_id;
