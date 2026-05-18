WITH scoped_archive AS (
  SELECT
    es.qbo_entity_type,
    es.qbo_entity_id
  FROM qbo_archive.entities_snapshot es
  WHERE es.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
    AND es.qbo_realm_id = '123145885549599'
    AND es.qbo_entity_type IN ('Account', 'Item', 'Vendor', 'Customer', 'Class')
  GROUP BY es.qbo_entity_type, es.qbo_entity_id
),
archive_counts AS (
  SELECT 'accounts'::text AS entity_type, count(*)::bigint AS archive_distinct_qbo_ids
  FROM scoped_archive
  WHERE qbo_entity_type = 'Account'
  UNION ALL
  SELECT 'items', count(*)::bigint
  FROM scoped_archive
  WHERE qbo_entity_type = 'Item'
  UNION ALL
  SELECT 'vendors', count(*)::bigint
  FROM scoped_archive
  WHERE qbo_entity_type = 'Vendor'
  UNION ALL
  SELECT 'customers', count(*)::bigint
  FROM scoped_archive
  WHERE qbo_entity_type = 'Customer'
  UNION ALL
  SELECT 'classes', count(*)::bigint
  FROM scoped_archive
  WHERE qbo_entity_type = 'Class'
),
mirror_counts AS (
  SELECT 'accounts'::text AS entity_type, count(*)::bigint AS mirror_table_count
  FROM mdata.qbo_accounts
  WHERE operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
  UNION ALL
  SELECT 'items', count(*)::bigint
  FROM mdata.qbo_items
  WHERE operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
  UNION ALL
  SELECT 'vendors', count(*)::bigint
  FROM mdata.qbo_vendors
  WHERE operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
  UNION ALL
  SELECT 'customers', count(*)::bigint
  FROM mdata.qbo_customers
  WHERE operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
  UNION ALL
  SELECT 'classes', count(*)::bigint
  FROM mdata.qbo_classes
  WHERE operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
),
operational_counts AS (
  SELECT 'accounts'::text AS entity_type, count(*)::bigint AS operational_table_count
  FROM catalogs.accounts a
  WHERE a.qbo_account_id IN (SELECT qbo_entity_id FROM scoped_archive WHERE qbo_entity_type = 'Account')
  UNION ALL
  SELECT 'items', count(*)::bigint
  FROM catalogs.items i
  WHERE i.qbo_item_id IN (SELECT qbo_entity_id FROM scoped_archive WHERE qbo_entity_type = 'Item')
  UNION ALL
  SELECT 'vendors', count(*)::bigint
  FROM mdata.vendors v
  WHERE v.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
    AND v.qbo_vendor_id IN (SELECT qbo_entity_id FROM scoped_archive WHERE qbo_entity_type = 'Vendor')
  UNION ALL
  SELECT 'customers', count(*)::bigint
  FROM mdata.customers c
  WHERE c.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
    AND c.qbo_customer_id IN (SELECT qbo_entity_id FROM scoped_archive WHERE qbo_entity_type = 'Customer')
  UNION ALL
  SELECT 'classes', count(*)::bigint
  FROM catalogs.classes c
  WHERE c.qbo_class_id IN (SELECT qbo_entity_id FROM scoped_archive WHERE qbo_entity_type = 'Class')
)
SELECT
  ac.entity_type,
  ac.archive_distinct_qbo_ids,
  mc.mirror_table_count,
  oc.operational_table_count
FROM archive_counts ac
JOIN mirror_counts mc USING (entity_type)
JOIN operational_counts oc USING (entity_type)
ORDER BY CASE ac.entity_type
  WHEN 'accounts' THEN 1
  WHEN 'items' THEN 2
  WHEN 'vendors' THEN 3
  WHEN 'customers' THEN 4
  WHEN 'classes' THEN 5
  ELSE 99
END;
