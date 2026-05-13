BEGIN;

CREATE SCHEMA IF NOT EXISTS catalogs;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['chart_of_accounts_seeds', 'expense_categories', 'payment_methods', 'tax_codes', 'currency_codes']
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS catalogs.%I (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        operating_company_id uuid NOT NULL REFERENCES org.companies(id),
        code text NOT NULL,
        display_name text NOT NULL,
        description text,
        metadata jsonb NOT NULL DEFAULT ''{}''::jsonb,
        is_active boolean NOT NULL DEFAULT true,
        sort_order int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (operating_company_id, code)
      )',
      tbl
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%I_company_active ON catalogs.%I (operating_company_id, is_active)',
      tbl,
      tbl
    );
    EXECUTE format('ALTER TABLE catalogs.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.%I TO ih35_app', tbl);
    EXECUTE format('DROP POLICY IF EXISTS company_scope ON catalogs.%I', tbl);
    EXECUTE format(
      'CREATE POLICY company_scope
       ON catalogs.%I
       FOR ALL TO ih35_app
       USING (operating_company_id::text = current_setting(''app.operating_company_id'', true))
       WITH CHECK (operating_company_id::text = current_setting(''app.operating_company_id'', true))',
      tbl
    );
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION catalogs.__seed_accounting_company_catalog(p_table text, p_entries jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  sql text;
BEGIN
  sql := format(
    $SQL$
      WITH cos AS (
        SELECT id
        FROM org.companies
        WHERE deactivated_at IS NULL
      )
      INSERT INTO catalogs.%I
        (operating_company_id, code, display_name, description, metadata, is_active, sort_order)
      SELECT
        cos.id,
        x.code,
        x.display_name,
        x.description,
        COALESCE(x.metadata, '{}'::jsonb),
        true,
        x.sort_order
      FROM cos
      CROSS JOIN jsonb_to_recordset($1) AS x(
        code text,
        display_name text,
        description text,
        metadata jsonb,
        sort_order int
      )
      ON CONFLICT DO NOTHING
    $SQL$,
    p_table
  );

  EXECUTE sql USING p_entries;
END
$$;

SELECT catalogs.__seed_accounting_company_catalog(
  'chart_of_accounts_seeds',
  jsonb_build_array(
    jsonb_build_object('code', '1100', 'display_name', 'Accounts receivable', 'description', 'Template seed — A/R', 'metadata', jsonb_build_object('account_type', 'Asset', 'account_subtype', 'AccountsReceivable'), 'sort_order', 10),
    jsonb_build_object('code', '2000', 'display_name', 'Accounts payable', 'description', 'Template seed — A/P', 'metadata', jsonb_build_object('account_type', 'Liability', 'account_subtype', 'AccountsPayable'), 'sort_order', 20),
    jsonb_build_object('code', '6100', 'display_name', 'Operating fuel expense', 'description', 'Template seed — fuel expense', 'metadata', jsonb_build_object('account_type', 'Expense', 'account_subtype', 'FuelCosts'), 'sort_order', 30)
  )
);

SELECT catalogs.__seed_accounting_company_catalog(
  'expense_categories',
  jsonb_build_array(
    jsonb_build_object('code', 'FUEL', 'display_name', 'Fuel', 'description', 'Fuel purchases', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'REPAIR', 'display_name', 'Repairs & maintenance', 'description', 'Shop and roadside repairs', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'PERMIT', 'display_name', 'Permits', 'description', 'Permits and authority', 'metadata', '{}'::jsonb, 'sort_order', 30)
  )
);

SELECT catalogs.__seed_accounting_company_catalog(
  'payment_methods',
  jsonb_build_array(
    jsonb_build_object('code', 'ACH', 'display_name', 'ACH transfer', 'description', 'Bank ACH', 'metadata', jsonb_build_object('rails', 'ach'), 'sort_order', 10),
    jsonb_build_object('code', 'WIRE', 'display_name', 'Wire', 'description', 'Domestic wire', 'metadata', jsonb_build_object('rails', 'wire'), 'sort_order', 20),
    jsonb_build_object('code', 'CARD', 'display_name', 'Corporate card', 'description', 'Purchasing or fuel card', 'metadata', jsonb_build_object('rails', 'card'), 'sort_order', 30)
  )
);

SELECT catalogs.__seed_accounting_company_catalog(
  'tax_codes',
  jsonb_build_array(
    jsonb_build_object('code', 'TAX-US-TX', 'display_name', 'Texas sales/use template', 'description', 'Placeholder tax bucket — map to QBO in production', 'metadata', jsonb_build_object('region', 'US-TX'), 'sort_order', 10),
    jsonb_build_object('code', 'TAX-EXEMPT', 'display_name', 'Exempt', 'description', 'Zero tax / exempt placeholder', 'metadata', jsonb_build_object('exempt', true), 'sort_order', 20)
  )
);

SELECT catalogs.__seed_accounting_company_catalog(
  'currency_codes',
  jsonb_build_array(
    jsonb_build_object('code', 'USD', 'display_name', 'US Dollar', 'description', 'USD — primary operating currency', 'metadata', jsonb_build_object('iso_numeric', '840'), 'sort_order', 10),
    jsonb_build_object('code', 'CAD', 'display_name', 'Canadian Dollar', 'description', 'CAD — cross-border helper', 'metadata', jsonb_build_object('iso_numeric', '124'), 'sort_order', 20)
  )
);

DROP FUNCTION IF EXISTS catalogs.__seed_accounting_company_catalog(text, jsonb);

COMMIT;
