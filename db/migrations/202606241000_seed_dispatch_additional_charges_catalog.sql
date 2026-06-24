-- 202606241000 — W-2: seed the dispatch "Additional Charges" catalog (Book Load "+ Create charge" codes).
--
-- GUARD live (2026-06-24): catalogs.additional_charges has 0 rows in PROD, so the Book Load AccessorialEditor
-- CODE combobox is empty. The "15 rows" seen locally are an e2e/test FIXTURE — never a migration — so prod
-- never got them (catalog prod-drift). This seeds the canonical codes for EVERY operating company so the
-- dropdown is populated everywhere, env-agnostically (resolved via org.companies, not a hardcoded id).
--
-- Idempotent: ON CONFLICT (operating_company_id, code) DO NOTHING — safe to re-run; will not duplicate the
-- rows already present on e2e. Entity-scoped (operating_company_id). Reference data only (no GL / posting).
-- GATED (catalogs.*): build-and-HOLD — only Jorge merges, after review, and runs db:migrate on prod.

BEGIN;

INSERT INTO catalogs.additional_charges (operating_company_id, code, display_name, description, sort_order, is_active)
SELECT c.id, v.code, v.display_name, v.description, v.sort_order, true
FROM org.companies c
CROSS JOIN (VALUES
  ('FSC',       'Fuel surcharge',  'Fuel surcharge',          10),
  ('DETENTION', 'Detention',       'Detention charge',        20),
  ('LAYOVER',   'Layover',         'Layover charge',          30),
  ('LUMPER',    'Lumper',          'Lumper charge',           40),
  ('TONU',      'TONU',            'Truck ordered not used',  50),
  ('MISC',      'Misc accessorial','Misc accessorial',        60)
) AS v(code, display_name, description, sort_order)
ON CONFLICT (operating_company_id, code) DO NOTHING;

COMMIT;
