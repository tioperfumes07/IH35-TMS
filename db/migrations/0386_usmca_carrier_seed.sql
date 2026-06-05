-- USMCA-2: enrich hidden USMCA carrier profile (pre-launch, is_active=false until USMCA-3 toggle).
BEGIN;

UPDATE org.companies
SET
  legal_name = COALESCE(NULLIF(legal_name, ''), 'USMCA Freight Solutions Inc'),
  short_name = COALESCE(NULLIF(short_name, ''), 'USMCA Freight'),
  address_line1 = COALESCE(address_line1, '1500 International Blvd'),
  city = COALESCE(city, 'Laredo'),
  state = COALESCE(state, 'TX'),
  postal_code = COALESCE(postal_code, '78045'),
  country = COALESCE(country, 'US'),
  phone = COALESCE(phone, '+1-956-000-0000'),
  email = COALESCE(email, 'ops@usmcafreight.example'),
  usdot_number = COALESCE(usdot_number, 'PENDING-USMCA-DOT'),
  mc_number = COALESCE(mc_number, 'PENDING-USMCA-MC'),
  is_active = false,
  updated_at = now()
WHERE code = 'USMCA';

INSERT INTO catalogs.complaint_types
  (operating_company_id, type_code, type_name, default_severity, is_active)
SELECT c.id, x.type_code, x.type_name, x.default_severity, true
FROM org.companies c
CROSS JOIN (
  VALUES
    ('WORKPLACE', 'Workplace complaint', 'warning'),
    ('CIVILIAN-ROAD', 'Civilian road complaint', 'warning'),
    ('DRIVER-DRIVER', 'Driver to driver complaint', 'info'),
    ('CUSTOMER', 'Customer complaint', 'warning'),
    ('ANONYMOUS', 'Anonymous complaint', 'info')
) AS x(type_code, type_name, default_severity)
WHERE c.code = 'USMCA'
ON CONFLICT (operating_company_id, type_code) DO NOTHING;

COMMIT;
