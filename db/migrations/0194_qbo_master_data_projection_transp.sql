BEGIN;

-- QBO class mirror table for archive projections.
CREATE TABLE IF NOT EXISTS mdata.qbo_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  qbo_id text NOT NULL,
  qbo_sync_token text,
  name text NOT NULL,
  fully_qualified_name text,
  active boolean NOT NULL DEFAULT true,
  qbo_updated_at timestamptz,
  mirrored_at timestamptz NOT NULL DEFAULT now(),
  payload_json jsonb,
  UNIQUE (operating_company_id, qbo_id)
);

CREATE INDEX IF NOT EXISTS ix_qbo_classes_search
  ON mdata.qbo_classes USING gin (to_tsvector('english', name || ' ' || COALESCE(fully_qualified_name, '')));

CREATE INDEX IF NOT EXISTS ix_qbo_classes_active
  ON mdata.qbo_classes (operating_company_id, active);

DO $$
DECLARE
  v_company_id constant uuid := '91e0bf0a-133f-4ce8-a734-2586cfa66d96';
  v_qbo_realm_id constant text := '123145885549599';
BEGIN
  IF to_regclass('qbo_archive.entities_snapshot') IS NULL THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE tmp_qbo_master_latest ON COMMIT DROP AS
  WITH ranked AS (
    SELECT
      es.qbo_entity_type,
      es.qbo_entity_id,
      es.qbo_active_at_snapshot,
      es.raw_snapshot,
      es.snapshot_taken_at,
      es.created_at,
      row_number() OVER (
        PARTITION BY es.qbo_entity_type, es.qbo_entity_id
        ORDER BY es.snapshot_taken_at DESC, es.created_at DESC
      ) AS rn
    FROM qbo_archive.entities_snapshot es
    WHERE es.operating_company_id = v_company_id
      AND es.qbo_realm_id = v_qbo_realm_id
      AND es.qbo_entity_type IN ('Account', 'Item', 'Vendor', 'Customer', 'Class')
  )
  SELECT
    qbo_entity_type,
    qbo_entity_id,
    qbo_active_at_snapshot,
    raw_snapshot,
    snapshot_taken_at,
    created_at
  FROM ranked
  WHERE rn = 1;

  -- Stage A: archive -> mirror
  INSERT INTO mdata.qbo_accounts (
    operating_company_id,
    qbo_id,
    qbo_sync_token,
    name,
    full_qualified_name,
    account_type,
    account_sub_type,
    active,
    qbo_updated_at,
    mirrored_at,
    payload_json
  )
  SELECT
    v_company_id,
    t.qbo_entity_id,
    NULLIF(t.raw_snapshot->>'SyncToken', ''),
    COALESCE(NULLIF(t.raw_snapshot->>'Name', ''), t.qbo_entity_id),
    NULLIF(t.raw_snapshot->>'FullyQualifiedName', ''),
    NULLIF(t.raw_snapshot->>'AccountType', ''),
    NULLIF(t.raw_snapshot->>'AccountSubType', ''),
    CASE
      WHEN lower(COALESCE(t.raw_snapshot->>'Active', '')) IN ('true', 'false') THEN (t.raw_snapshot->>'Active')::boolean
      ELSE COALESCE(t.qbo_active_at_snapshot, true)
    END,
    CASE
      WHEN NULLIF(t.raw_snapshot#>>'{MetaData,LastUpdatedTime}', '') IS NULL THEN NULL
      ELSE (t.raw_snapshot#>>'{MetaData,LastUpdatedTime}')::timestamptz
    END,
    now(),
    t.raw_snapshot
  FROM tmp_qbo_master_latest t
  WHERE t.qbo_entity_type = 'Account'
  ON CONFLICT (operating_company_id, qbo_id)
  DO UPDATE SET
    qbo_sync_token = EXCLUDED.qbo_sync_token,
    name = EXCLUDED.name,
    full_qualified_name = EXCLUDED.full_qualified_name,
    account_type = EXCLUDED.account_type,
    account_sub_type = EXCLUDED.account_sub_type,
    active = EXCLUDED.active,
    qbo_updated_at = EXCLUDED.qbo_updated_at,
    mirrored_at = now(),
    payload_json = EXCLUDED.payload_json;

  INSERT INTO mdata.qbo_items (
    operating_company_id,
    qbo_id,
    qbo_sync_token,
    name,
    sku,
    item_type,
    unit_price_cents,
    active,
    qbo_updated_at,
    mirrored_at,
    payload_json
  )
  SELECT
    v_company_id,
    t.qbo_entity_id,
    NULLIF(t.raw_snapshot->>'SyncToken', ''),
    COALESCE(NULLIF(t.raw_snapshot->>'Name', ''), t.qbo_entity_id),
    NULLIF(t.raw_snapshot->>'Sku', ''),
    NULLIF(t.raw_snapshot->>'Type', ''),
    CASE
      WHEN NULLIF(t.raw_snapshot->>'UnitPrice', '') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN round((t.raw_snapshot->>'UnitPrice')::numeric * 100)::int
      ELSE NULL
    END,
    CASE
      WHEN lower(COALESCE(t.raw_snapshot->>'Active', '')) IN ('true', 'false') THEN (t.raw_snapshot->>'Active')::boolean
      ELSE COALESCE(t.qbo_active_at_snapshot, true)
    END,
    CASE
      WHEN NULLIF(t.raw_snapshot#>>'{MetaData,LastUpdatedTime}', '') IS NULL THEN NULL
      ELSE (t.raw_snapshot#>>'{MetaData,LastUpdatedTime}')::timestamptz
    END,
    now(),
    t.raw_snapshot
  FROM tmp_qbo_master_latest t
  WHERE t.qbo_entity_type = 'Item'
  ON CONFLICT (operating_company_id, qbo_id)
  DO UPDATE SET
    qbo_sync_token = EXCLUDED.qbo_sync_token,
    name = EXCLUDED.name,
    sku = EXCLUDED.sku,
    item_type = EXCLUDED.item_type,
    unit_price_cents = EXCLUDED.unit_price_cents,
    active = EXCLUDED.active,
    qbo_updated_at = EXCLUDED.qbo_updated_at,
    mirrored_at = now(),
    payload_json = EXCLUDED.payload_json;

  INSERT INTO mdata.qbo_vendors (
    operating_company_id,
    qbo_id,
    qbo_sync_token,
    display_name,
    company_name,
    primary_email,
    primary_phone,
    active,
    qbo_updated_at,
    mirrored_at,
    payload_json
  )
  SELECT
    v_company_id,
    t.qbo_entity_id,
    NULLIF(t.raw_snapshot->>'SyncToken', ''),
    COALESCE(NULLIF(t.raw_snapshot->>'DisplayName', ''), NULLIF(t.raw_snapshot->>'Name', ''), t.qbo_entity_id),
    COALESCE(NULLIF(t.raw_snapshot->>'CompanyName', ''), NULLIF(t.raw_snapshot->>'DisplayName', ''), NULLIF(t.raw_snapshot->>'Name', '')),
    NULLIF(t.raw_snapshot#>>'{PrimaryEmailAddr,Address}', ''),
    NULLIF(t.raw_snapshot#>>'{PrimaryPhone,FreeFormNumber}', ''),
    CASE
      WHEN lower(COALESCE(t.raw_snapshot->>'Active', '')) IN ('true', 'false') THEN (t.raw_snapshot->>'Active')::boolean
      ELSE COALESCE(t.qbo_active_at_snapshot, true)
    END,
    CASE
      WHEN NULLIF(t.raw_snapshot#>>'{MetaData,LastUpdatedTime}', '') IS NULL THEN NULL
      ELSE (t.raw_snapshot#>>'{MetaData,LastUpdatedTime}')::timestamptz
    END,
    now(),
    t.raw_snapshot
  FROM tmp_qbo_master_latest t
  WHERE t.qbo_entity_type = 'Vendor'
  ON CONFLICT (operating_company_id, qbo_id)
  DO UPDATE SET
    qbo_sync_token = EXCLUDED.qbo_sync_token,
    display_name = EXCLUDED.display_name,
    company_name = EXCLUDED.company_name,
    primary_email = EXCLUDED.primary_email,
    primary_phone = EXCLUDED.primary_phone,
    active = EXCLUDED.active,
    qbo_updated_at = EXCLUDED.qbo_updated_at,
    mirrored_at = now(),
    payload_json = EXCLUDED.payload_json;

  INSERT INTO mdata.qbo_customers (
    operating_company_id,
    qbo_id,
    qbo_sync_token,
    display_name,
    company_name,
    primary_email,
    primary_phone,
    mc_number,
    active,
    qbo_updated_at,
    mirrored_at,
    payload_json
  )
  SELECT
    v_company_id,
    t.qbo_entity_id,
    NULLIF(t.raw_snapshot->>'SyncToken', ''),
    COALESCE(NULLIF(t.raw_snapshot->>'DisplayName', ''), NULLIF(t.raw_snapshot->>'Name', ''), t.qbo_entity_id),
    COALESCE(NULLIF(t.raw_snapshot->>'CompanyName', ''), NULLIF(t.raw_snapshot->>'DisplayName', ''), NULLIF(t.raw_snapshot->>'Name', '')),
    NULLIF(t.raw_snapshot#>>'{PrimaryEmailAddr,Address}', ''),
    NULLIF(t.raw_snapshot#>>'{PrimaryPhone,FreeFormNumber}', ''),
    NULLIF(t.raw_snapshot->>'MCNumber', ''),
    CASE
      WHEN lower(COALESCE(t.raw_snapshot->>'Active', '')) IN ('true', 'false') THEN (t.raw_snapshot->>'Active')::boolean
      ELSE COALESCE(t.qbo_active_at_snapshot, true)
    END,
    CASE
      WHEN NULLIF(t.raw_snapshot#>>'{MetaData,LastUpdatedTime}', '') IS NULL THEN NULL
      ELSE (t.raw_snapshot#>>'{MetaData,LastUpdatedTime}')::timestamptz
    END,
    now(),
    t.raw_snapshot
  FROM tmp_qbo_master_latest t
  WHERE t.qbo_entity_type = 'Customer'
  ON CONFLICT (operating_company_id, qbo_id)
  DO UPDATE SET
    qbo_sync_token = EXCLUDED.qbo_sync_token,
    display_name = EXCLUDED.display_name,
    company_name = EXCLUDED.company_name,
    primary_email = EXCLUDED.primary_email,
    primary_phone = EXCLUDED.primary_phone,
    mc_number = EXCLUDED.mc_number,
    active = EXCLUDED.active,
    qbo_updated_at = EXCLUDED.qbo_updated_at,
    mirrored_at = now(),
    payload_json = EXCLUDED.payload_json;

  INSERT INTO mdata.qbo_classes (
    operating_company_id,
    qbo_id,
    qbo_sync_token,
    name,
    fully_qualified_name,
    active,
    qbo_updated_at,
    mirrored_at,
    payload_json
  )
  SELECT
    v_company_id,
    t.qbo_entity_id,
    NULLIF(t.raw_snapshot->>'SyncToken', ''),
    COALESCE(NULLIF(t.raw_snapshot->>'Name', ''), t.qbo_entity_id),
    NULLIF(t.raw_snapshot->>'FullyQualifiedName', ''),
    CASE
      WHEN lower(COALESCE(t.raw_snapshot->>'Active', '')) IN ('true', 'false') THEN (t.raw_snapshot->>'Active')::boolean
      ELSE COALESCE(t.qbo_active_at_snapshot, true)
    END,
    CASE
      WHEN NULLIF(t.raw_snapshot#>>'{MetaData,LastUpdatedTime}', '') IS NULL THEN NULL
      ELSE (t.raw_snapshot#>>'{MetaData,LastUpdatedTime}')::timestamptz
    END,
    now(),
    t.raw_snapshot
  FROM tmp_qbo_master_latest t
  WHERE t.qbo_entity_type = 'Class'
  ON CONFLICT (operating_company_id, qbo_id)
  DO UPDATE SET
    qbo_sync_token = EXCLUDED.qbo_sync_token,
    name = EXCLUDED.name,
    fully_qualified_name = EXCLUDED.fully_qualified_name,
    active = EXCLUDED.active,
    qbo_updated_at = EXCLUDED.qbo_updated_at,
    mirrored_at = now(),
    payload_json = EXCLUDED.payload_json;

  -- Stage B: mirror -> operational tables consumed by UI.
  -- catalogs.* are global (no operating_company_id); this is a known limitation for multi-company onboarding.
  INSERT INTO catalogs.accounts (
    account_number,
    account_name,
    account_type,
    account_subtype,
    qbo_account_id,
    notes,
    deactivated_at
  )
  SELECT
    CONCAT('QBO-', qa.qbo_id),
    qa.name,
    CASE
      WHEN qa.account_type IN ('Bank', 'Accounts Receivable', 'Other Current Asset', 'Fixed Asset', 'Other Asset') THEN 'Asset'
      WHEN qa.account_type IN ('Accounts Payable', 'Credit Card', 'Other Current Liability', 'Long Term Liability') THEN 'Liability'
      WHEN qa.account_type = 'Equity' THEN 'Equity'
      WHEN qa.account_type = 'Income' THEN 'Income'
      WHEN qa.account_type = 'Expense' THEN 'Expense'
      WHEN qa.account_type = 'Cost of Goods Sold' THEN 'CostOfGoodsSold'
      WHEN qa.account_type = 'Other Income' THEN 'OtherIncome'
      WHEN qa.account_type = 'Other Expense' THEN 'OtherExpense'
      ELSE 'Expense'
    END,
    qa.account_sub_type,
    qa.qbo_id,
    'Projected from qbo_archive.entities_snapshot (TRANSP realm 123145885549599)',
    CASE WHEN qa.active THEN NULL ELSE now() END
  FROM mdata.qbo_accounts qa
  WHERE qa.operating_company_id = v_company_id
    AND qa.qbo_id IS NOT NULL
  ON CONFLICT (qbo_account_id)
  DO UPDATE SET
    account_name = EXCLUDED.account_name,
    account_type = EXCLUDED.account_type,
    account_subtype = EXCLUDED.account_subtype,
    notes = EXCLUDED.notes,
    deactivated_at = CASE WHEN EXCLUDED.deactivated_at IS NULL THEN NULL ELSE COALESCE(catalogs.accounts.deactivated_at, EXCLUDED.deactivated_at) END;

  INSERT INTO catalogs.items (
    item_name,
    item_type,
    unit_price_cents,
    qbo_item_id,
    notes,
    deactivated_at
  )
  SELECT
    CONCAT(qi.name, ' [QBO ', qi.qbo_id, ']'),
    CASE
      WHEN qi.item_type IN ('Service', 'Inventory', 'NonInventory', 'Bundle', 'Discount', 'Charge') THEN qi.item_type
      ELSE 'Service'
    END,
    qi.unit_price_cents,
    qi.qbo_id,
    'Projected from qbo_archive.entities_snapshot (TRANSP realm 123145885549599)',
    CASE WHEN qi.active THEN NULL ELSE now() END
  FROM mdata.qbo_items qi
  WHERE qi.operating_company_id = v_company_id
    AND qi.qbo_id IS NOT NULL
  ON CONFLICT (qbo_item_id)
  DO UPDATE SET
    item_name = EXCLUDED.item_name,
    item_type = EXCLUDED.item_type,
    unit_price_cents = EXCLUDED.unit_price_cents,
    notes = EXCLUDED.notes,
    deactivated_at = CASE WHEN EXCLUDED.deactivated_at IS NULL THEN NULL ELSE COALESCE(catalogs.items.deactivated_at, EXCLUDED.deactivated_at) END;

  INSERT INTO catalogs.classes (
    class_name,
    qbo_class_id,
    notes,
    deactivated_at
  )
  SELECT
    CONCAT(qc.name, ' [QBO ', qc.qbo_id, ']'),
    qc.qbo_id,
    'Projected from qbo_archive.entities_snapshot (TRANSP realm 123145885549599)',
    CASE WHEN qc.active THEN NULL ELSE now() END
  FROM mdata.qbo_classes qc
  WHERE qc.operating_company_id = v_company_id
    AND qc.qbo_id IS NOT NULL
  ON CONFLICT (qbo_class_id)
  DO UPDATE SET
    class_name = EXCLUDED.class_name,
    notes = EXCLUDED.notes,
    deactivated_at = CASE WHEN EXCLUDED.deactivated_at IS NULL THEN NULL ELSE COALESCE(catalogs.classes.deactivated_at, EXCLUDED.deactivated_at) END;

  INSERT INTO mdata.vendors (
    operating_company_id,
    vendor_name,
    vendor_type,
    phone,
    email,
    qbo_vendor_id,
    notes,
    deactivated_at
  )
  SELECT
    v_company_id,
    qv.display_name,
    'Other',
    qv.primary_phone,
    qv.primary_email,
    qv.qbo_id,
    'Projected from qbo_archive.entities_snapshot (TRANSP realm 123145885549599)',
    CASE WHEN qv.active THEN NULL ELSE now() END
  FROM mdata.qbo_vendors qv
  WHERE qv.operating_company_id = v_company_id
    AND qv.qbo_id IS NOT NULL
  ON CONFLICT (operating_company_id, qbo_vendor_id)
  DO UPDATE SET
    vendor_name = EXCLUDED.vendor_name,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    notes = EXCLUDED.notes,
    deactivated_at = CASE WHEN EXCLUDED.deactivated_at IS NULL THEN NULL ELSE COALESCE(mdata.vendors.deactivated_at, EXCLUDED.deactivated_at) END;

  INSERT INTO mdata.customers (
    operating_company_id,
    customer_name,
    billing_email,
    billing_phone,
    mc_number,
    qbo_customer_id,
    status,
    notes,
    deactivated_at
  )
  SELECT
    v_company_id,
    qc.display_name,
    qc.primary_email,
    qc.primary_phone,
    qc.mc_number,
    qc.qbo_id,
    CASE WHEN qc.active THEN 'active'::mdata.customer_status ELSE 'inactive'::mdata.customer_status END,
    'Projected from qbo_archive.entities_snapshot (TRANSP realm 123145885549599)',
    CASE WHEN qc.active THEN NULL ELSE now() END
  FROM mdata.qbo_customers qc
  WHERE qc.operating_company_id = v_company_id
    AND qc.qbo_id IS NOT NULL
  ON CONFLICT (operating_company_id, qbo_customer_id)
  DO UPDATE SET
    customer_name = EXCLUDED.customer_name,
    billing_email = EXCLUDED.billing_email,
    billing_phone = EXCLUDED.billing_phone,
    mc_number = EXCLUDED.mc_number,
    notes = EXCLUDED.notes,
    status = CASE
      WHEN EXCLUDED.deactivated_at IS NULL THEN
        CASE WHEN mdata.customers.status = 'inactive'::mdata.customer_status THEN 'active'::mdata.customer_status ELSE mdata.customers.status END
      ELSE 'inactive'::mdata.customer_status
    END,
    deactivated_at = CASE WHEN EXCLUDED.deactivated_at IS NULL THEN NULL ELSE COALESCE(mdata.customers.deactivated_at, EXCLUDED.deactivated_at) END;
END
$$;

COMMIT;
