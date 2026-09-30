-- 202614820000_pm_catalog_usmca.sql
-- ROUND 297.2 A-27 (Lead order, owner-approved, 2026-09-30): the real preventive-maintenance
-- interval catalog for USMCA. Live-measured before this migration: catalogs.pm_intervals carries
-- exactly 1 row, 'CC3-TEST-PMINTERVAL-20260822', is_active=false already -- no real intervals exist
-- anywhere. Owner-specified PM interval is 25,000 miles; the six intervals below are the real
-- schedule the owner approved this round.
--
-- Additive, idempotent (ON CONFLICT DO NOTHING keyed on (operating_company_id, code), matching the
-- table's own natural key), CREATE-only. Does not delete or hard-remove the test row -- it is
-- deactivated (is_active=false) only, per the order: "Do NOT delete -- it goes out with the purge
-- under its own owner authorization."
--
-- This writes to catalogs.pm_intervals (a maintenance catalog table), not to any money/accounting/
-- load table named in the 2026-09-30 owner freeze -- explicitly owner-approved this round.

BEGIN;

DO $$
DECLARE
  usmca_id uuid := '5c854333-6ea5-4faa-af31-67cb272fef80';
BEGIN
  INSERT INTO catalogs.pm_intervals (id, operating_company_id, code, display_name, description, metadata, is_active, sort_order, created_at, updated_at)
  VALUES
    (gen_random_uuid(), usmca_id, 'PM-A', 'PM-A Service',
     'Preventive maintenance A-service — 25,000 mile interval.',
     jsonb_build_object('interval_kind', 'miles', 'interval_value', 25000, 'warn_threshold', 2500), true, 10, now(), now()),
    (gen_random_uuid(), usmca_id, 'PM-B', 'PM-B Service',
     'Preventive maintenance B-service — 100,000 mile interval.',
     jsonb_build_object('interval_kind', 'miles', 'interval_value', 100000, 'warn_threshold', 5000), true, 20, now(), now()),
    (gen_random_uuid(), usmca_id, 'DOT', 'DOT Inspection',
     'Annual DOT inspection — 12 month interval.',
     jsonb_build_object('interval_kind', 'months', 'interval_value', 12, 'warn_threshold', 1), true, 30, now(), now()),
    (gen_random_uuid(), usmca_id, 'TIRE', 'Tire Service',
     'Tire rotation/replacement — 50,000 mile interval.',
     jsonb_build_object('interval_kind', 'miles', 'interval_value', 50000, 'warn_threshold', 4000), true, 40, now(), now()),
    (gen_random_uuid(), usmca_id, 'BRK', 'Brake Service',
     'Brake inspection/service — 50,000 mile interval.',
     jsonb_build_object('interval_kind', 'miles', 'interval_value', 50000, 'warn_threshold', 4000), true, 50, now(), now()),
    (gen_random_uuid(), usmca_id, 'COOL', 'Coolant Service',
     'Coolant system service — 24 month interval.',
     jsonb_build_object('interval_kind', 'months', 'interval_value', 24, 'warn_threshold', 2), true, 60, now(), now())
  ON CONFLICT (operating_company_id, code) DO NOTHING;

  -- Deactivate the test row, never delete it.
  UPDATE catalogs.pm_intervals
     SET is_active = false, updated_at = now()
   WHERE operating_company_id = usmca_id
     AND code = 'CC3-TEST-PMINTERVAL-20260822'
     AND is_active = true;
END $$;

COMMIT;
