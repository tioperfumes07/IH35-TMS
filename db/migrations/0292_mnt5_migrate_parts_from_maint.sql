BEGIN;

WITH source_rows AS (
  SELECT
    p.id AS legacy_part_id,
    p.tenant_id,
    p.sku,
    p.name,
    p.category,
    p.unit_cost_cents,
    p.qty_on_hand,
    p.created_at,
    p.updated_at,
    (
      substr(md5(p.tenant_id::text || ':' || p.sku), 1, 8) || '-' ||
      substr(md5(p.tenant_id::text || ':' || p.sku), 9, 4) || '-' ||
      substr(md5(p.tenant_id::text || ':' || p.sku), 13, 4) || '-' ||
      substr(md5(p.tenant_id::text || ':' || p.sku), 17, 4) || '-' ||
      substr(md5(p.tenant_id::text || ':' || p.sku), 21, 12)
    )::uuid AS deterministic_id
  FROM maint.part p
),
inserted AS (
  INSERT INTO maintenance.parts_inventory (
    id,
    part_description,
    vendor_id,
    last_purchase_invoice_number,
    last_purchase_amount,
    last_purchase_date,
    on_hand_qty,
    location,
    operating_company_id,
    created_at,
    updated_at
  )
  SELECT
    sr.deterministic_id,
    CONCAT('[', sr.sku, '] ', sr.name),
    NULL,
    NULL,
    ROUND((sr.unit_cost_cents::numeric / 100.0), 2),
    NULL,
    sr.qty_on_hand,
    NULLIF(sr.category, ''),
    sr.tenant_id,
    sr.created_at,
    sr.updated_at
  FROM source_rows sr
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
SELECT COUNT(*)::int AS inserted_rows FROM inserted;

COMMIT;
