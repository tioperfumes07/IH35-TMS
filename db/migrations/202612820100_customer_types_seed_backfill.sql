-- LST-WIRE-07-CUSTOMER-TYPES-CATALOG-NO-CONSUMER — live-verified defect (Neon MCP, project
-- tiny-field-89581227, branch br-fancy-credit-akjnd07a, 2026-08-20): catalogs.customer_types has
-- the correct schema (migration 202610150000 created the table/indexes/constraints successfully —
-- proven by 202612820000's FK on customer_type_id referencing it) but ZERO rows on prod for all 3
-- active companies (TRANSP/TRK/USMCA), despite that migration's own seed INSERT being designed to
-- populate 6 starter rows per company. Most likely explanation: the seed's
-- `SELECT c.id FROM org.companies c WHERE c.deactivated_at IS NULL` ran before all 3 companies
-- existed in their current form, inserted for whatever subset (possibly zero) existed at that
-- instant, and never re-ran since migrations apply exactly once and are never re-triggered by
-- later data changes.
--
-- This migration is the ORIGINAL seed INSERT verbatim, re-run as its own migration. It is already
-- idempotent (ON CONFLICT DO NOTHING keyed on operating_company_id+code) and dynamic over
-- org.companies (never a hardcoded UUID), so re-running it is safe regardless of the exact prior
-- failure mode: it inserts only the rows genuinely missing, for whichever companies are active at
-- migration time, and touches nothing that already exists.

BEGIN;

INSERT INTO catalogs.customer_types (operating_company_id, code, display_name, description, sort_order)
SELECT c.id, s.code, s.display_name, s.description, s.sort_order
  FROM org.companies c
  CROSS JOIN (VALUES
    ('COMMERCIAL',     'Commercial',      'Direct commercial shipper',                      10),
    ('BROKER',         'Broker',          'Freight broker or 3PL intermediary',             20),
    ('SHIPPER_DIRECT', 'Direct Shipper',  'Manufacturer or distributor shipping own freight', 30),
    ('GOVERNMENT',     'Government',      'Government or municipal account',                40),
    ('INTERCOMPANY',   'Intercompany',    'Another IH35 operating entity',                  50),
    ('OTHER',          'Other',           'Uncategorised',                                  90)
  ) AS s(code, display_name, description, sort_order)
 WHERE c.deactivated_at IS NULL
ON CONFLICT (operating_company_id, code) DO NOTHING;

COMMIT;
