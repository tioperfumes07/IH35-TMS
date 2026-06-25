-- 202606242100 — Seed catalogs.lumper_providers: minimal generic starter set.
--
-- DEPENDS ON 202606241800 (PR #1463) which CREATES catalogs.lumper_providers (one of the 24 generic
-- catalogs). NO PR until #1463 is live (table must exist first). [HOLD-FOR-JORGE], catalogs.* DATA = §1.4.
--
-- ⚠ PLACEHOLDER DATA: the DOT workbook has NO lumper-provider list, so this seeds only operationally
-- universal lumper-HANDLING categories (not invented commercial vendor names — per the never-fabricate
-- rule). Jorge should confirm or send the real provider list to expand. Unblocks wizard W-5/W-6 by
-- giving the lumper dropdown a non-empty starting set (inline "+ Add new" still available).
--
-- Generic catalog shape (code/display_name/description/metadata/is_active/sort_order). Per-entity
-- (TRANSP/TRK/USMCA, non-deactivated). Idempotent: ON CONFLICT (operating_company_id, code) DO NOTHING.

BEGIN;

INSERT INTO catalogs.lumper_providers
  (operating_company_id, code, display_name, description, metadata, is_active, sort_order)
SELECT c.id, v.code, v.display_name, v.description, '{}'::jsonb, true, v.sort_order
FROM org.companies c
CROSS JOIN (VALUES
  ('CASH', 'Cash lumper', 'Lumper paid in cash at the dock', 10),
  ('BROKER', 'Broker-arranged', 'Lumper arranged and/or reimbursed through the broker', 20),
  ('WAREHOUSE', 'Warehouse / facility', 'Lumper service provided by the receiving warehouse/facility', 30),
  ('THIRD_PARTY', 'Third-party service', 'Independent third-party lumper/unloading service', 40),
  ('OTHER', 'Other', 'Other or unlisted lumper provider', 50)
) AS v(code, display_name, description, sort_order)
WHERE c.deactivated_at IS NULL
ON CONFLICT (operating_company_id, code) DO NOTHING;

COMMIT;
