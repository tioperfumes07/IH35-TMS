-- 202606242000 — Seed catalogs.civil_fine_types: 19 FMCSA company civil-penalty types (no hazmat).
--
-- DEPENDS ON 202606241800 (PR #1463) which CREATES catalogs.civil_fine_types. Do NOT merge or apply
-- until #1463 is live (the table must exist first). [HOLD-FOR-JORGE], catalogs.* DATA = §1.4 gated.
--
-- Source: IH35-DOT-FINES-VIOLATIONS-CATALOG-2026-06-24-no hazmat.xlsx, "Company Civil Fines" sheet.
-- HazMat EXCLUDED per Jorge's 2026-06-24 ruling (§4). civil_fine_types is the GENERIC catalog shape
-- (code/display_name/description/metadata/is_active/sort_order) — verified live on the #1463 branch — so
-- the sheet's extra columns (basic_category, cfr_part, typical_penalty_usd, penalty_basis) are stored in
-- the metadata jsonb (no bespoke columns). If Jorge prefers a bespoke civil_fine_types shape, this seed's
-- mapping changes.
-- Per-entity (TRANSP/TRK/USMCA, non-deactivated). Idempotent: ON CONFLICT (operating_company_id, code)
-- DO NOTHING.

BEGIN;

INSERT INTO catalogs.civil_fine_types
  (operating_company_id, code, display_name, description, metadata, is_active, sort_order)
SELECT c.id, v.code, v.display_name, v.description, v.metadata::jsonb, true, v.sort_order
FROM org.companies c
CROSS JOIN (VALUES
  ('CIV-OOS-DRIVE', 'Operating while OOS', 'Operating a CMV / using a driver placed out of service. Among the highest civil penalties.', '{"basic_category":"Unsafe Driving","cfr_part":"386","typical_penalty_usd":"Up to 28,000","penalty_basis":"per violation"}', 10),
  ('CIV-OOS-DRIVER', 'Driver OOS violation', 'Allowing or requiring a driver to operate while under an OOS order.', '{"basic_category":"Driver Fitness","cfr_part":"386","typical_penalty_usd":"Up to 19,000","penalty_basis":"per violation"}', 20),
  ('CIV-RECORDKEEP', 'Recordkeeping violation', 'Falsification or non-production of required records.', '{"basic_category":"HOS Compliance","cfr_part":"390","typical_penalty_usd":"Up to 16,000","penalty_basis":"per violation"}', 30),
  ('CIV-HOS', 'HOS violation (carrier)', 'Carrier permitting HOS violations or a pattern of violations.', '{"basic_category":"HOS Compliance","cfr_part":"395","typical_penalty_usd":"1,000 to 16,000","penalty_basis":"per violation"}', 40),
  ('CIV-NONRECORD', 'Non-recordkeeping violation', 'General non-recordkeeping FMCSR violation by carrier.', '{"basic_category":"Driver Fitness","cfr_part":"390","typical_penalty_usd":"Up to 16,000","penalty_basis":"per violation"}', 50),
  ('CIV-CLEARINGHOUSE', 'Clearinghouse violation', 'Employer failure to query or report in the Drug & Alcohol Clearinghouse.', '{"basic_category":"Controlled Substances/Alcohol","cfr_part":"382","typical_penalty_usd":"Up to 6,500","penalty_basis":"per violation"}', 60),
  ('CIV-DRUGTEST', 'D&A testing program', 'Failure to implement required drug & alcohol testing program.', '{"basic_category":"Controlled Substances/Alcohol","cfr_part":"382","typical_penalty_usd":"Up to 16,000","penalty_basis":"per violation"}', 70),
  ('CIV-OPERATE-AUTH', 'Operating without authority', 'Operating without required FMCSA operating authority or registration.', '{"basic_category":"Driver Fitness","cfr_part":"392","typical_penalty_usd":"Up to 33,000","penalty_basis":"per violation"}', 80),
  ('CIV-INSURANCE', 'Insufficient insurance', 'Operating without required minimum financial responsibility / insurance.', '{"basic_category":"Driver Fitness","cfr_part":"387","typical_penalty_usd":"Up to 19,000","penalty_basis":"per day"}', 90),
  ('CIV-FINANCIAL', 'Financial responsibility', 'Failure to maintain proof of financial responsibility.', '{"basic_category":"Driver Fitness","cfr_part":"387","typical_penalty_usd":"Up to 19,000","penalty_basis":"per violation"}', 100),
  ('CIV-CDL-VIOL', 'CDL violation (carrier)', 'Knowingly using a driver without a valid CDL.', '{"basic_category":"Driver Fitness","cfr_part":"383","typical_penalty_usd":"Up to 6,000","penalty_basis":"per violation"}', 110),
  ('CIV-INSPECT-FAIL', 'Inspection/maintenance program', 'Failure to maintain a systematic inspection / repair / maintenance program.', '{"basic_category":"Vehicle Maintenance","cfr_part":"396","typical_penalty_usd":"Up to 16,000","penalty_basis":"per violation"}', 120),
  ('CIV-ELD-NONCOMP', 'ELD non-compliance', 'Carrier using non-registered/non-compliant ELDs or no ELD program.', '{"basic_category":"HOS Compliance","cfr_part":"395","typical_penalty_usd":"Up to 16,000","penalty_basis":"per violation"}', 130),
  ('CIV-NEWENTRANT', 'New entrant failure', 'Failure of new-entrant safety audit or continued operation after failure.', '{"basic_category":"Driver Fitness","cfr_part":"385","typical_penalty_usd":"Varies","penalty_basis":"per violation"}', 140),
  ('CIV-IFTA', 'IFTA non-compliance', 'Failure to file/pay International Fuel Tax Agreement returns (state-assessed).', '{"basic_category":"Other","cfr_part":"N/A","typical_penalty_usd":"Varies by state","penalty_basis":"per filing"}', 150),
  ('CIV-IRP', 'IRP / apportioned reg', 'International Registration Plan / apportioned plate non-compliance (state).', '{"basic_category":"Other","cfr_part":"N/A","typical_penalty_usd":"Varies by state"}', 160),
  ('CIV-OVERWEIGHT', 'Overweight / oversize', 'Exceeding weight or size limits (state DOT / port of entry assessed).', '{"basic_category":"Other","cfr_part":"N/A","typical_penalty_usd":"Varies by state"}', 170),
  ('CIV-IFTA-DECAL', 'Missing IFTA decal/credentials', 'Operating without IFTA decals / cab card / required credentials.', '{"basic_category":"Other","cfr_part":"N/A","typical_penalty_usd":"Varies by state"}', 180),
  ('CIV-UCR', 'UCR non-registration', 'Failure to register / pay Unified Carrier Registration.', '{"basic_category":"Other","cfr_part":"N/A","typical_penalty_usd":"Up to 10,000","penalty_basis":"per violation"}', 190)
) AS v(code, display_name, description, metadata, sort_order)
WHERE c.deactivated_at IS NULL
ON CONFLICT (operating_company_id, code) DO NOTHING;

COMMIT;
