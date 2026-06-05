-- CATALOG-3: seed complaint_types per active operating company (idempotent).
BEGIN;

INSERT INTO catalogs.complaint_types
  (operating_company_id, type_code, type_name, default_severity, is_active)
SELECT cos.id, x.type_code, x.type_name, x.default_severity, true
FROM org.companies cos
CROSS JOIN (
  VALUES
    ('WORKPLACE', 'Workplace complaint', 'warning'),
    ('CIVILIAN-ROAD', 'Civilian road complaint', 'warning'),
    ('DRIVER-DRIVER', 'Driver to driver complaint', 'info'),
    ('CUSTOMER', 'Customer complaint', 'warning'),
    ('ANONYMOUS', 'Anonymous complaint', 'info')
) AS x(type_code, type_name, default_severity)
WHERE cos.deactivated_at IS NULL
ON CONFLICT (operating_company_id, type_code) DO NOTHING;

COMMIT;
