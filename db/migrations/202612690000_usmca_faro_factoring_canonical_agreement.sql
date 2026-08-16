-- ACCT-F5332 / LV-USMCA-FACTORING-GL-FLAG-OVERRIDE-CONTRADICTS-OWN-POLICY (board row, filed
-- 2026-08-16) — owner confirmed in chat 2026-08-16: "we began factoring with faro already this
-- past week, same terms as transportation" / "the effective was august 7, 2026". USMCA is now a
-- genuine Faro Full Recourse V1 party, same terms as TRANSP's live agreement
-- (id f442b952-909d-4612-ba71-451694999b2f): 97% advance / 1.5% fee tier1 / 2.0% fee tier2 / 1.5%
-- security reserve / 30-day repurchase term / 5-day grace / 95-day repurchase deadline /
-- 0.00067/day default interest — all of which are DB-CHECK-enforced canonical constants on
-- factoring.canonical_factor_agreements, so this migration cannot drift from TRANSP's terms even
-- by mistake.
--
-- TWO ROWS, in dependency order:
--
-- 1. mdata.vendors — a TMS-native "Faro Factoring" vendor record for USMCA. TRANSP's own Faro
--    vendor row is source_system='qbo' (a QBO-projected vendor, since TRANSP's real books are in
--    QuickBooks) — that pattern does NOT apply to USMCA, which has no QuickBooks at all (TMS is
--    USMCA's ERP, owner ruling 2026-08-11). This row is source_system='tms' (the mdata.vendors
--    table default), matching every other USMCA-native vendor.
--
-- 2. factoring.canonical_factor_agreements — the row resolveCanonicalActiveFactor()
--    (factoring-balance-invoice-linkage.service.ts) actually reads. FKs to the USMCA vendor row
--    above (factor_vendor_id) and to the USMCA factor profile row created earlier this session
--    (factor_profile_id = 40b3690b-f1d4-44b4-90cf-c1cfd4f79c33, LV-USMCA-NO-ACTIVE-FACTOR-BLOCKS-PROFILE,
--    already live, terms independently verified to match). effective_from = 2026-08-07 per the
--    owner's stated start date.
--
-- This migration does NOT touch apps/backend/src/home/factoring-balance-invoice-linkage.service.ts's
-- isTranspContractEntityCode() — that code-level gate is widened in the same PR's code diff, not
-- here; a migration only seeds data, it never changes application logic.
--
-- IDEMPOTENT: both rows use a fixed, explicit id (never gen_random_uuid()) so a second run's
-- ON CONFLICT DO NOTHING is a true no-op keyed on the primary key, not a guess at natural
-- uniqueness (mdata.vendors has no unique constraint on vendor_name+company).
--
-- LIVE-VERIFIED BEFORE WRITING THIS: TRANSP's live agreement row, vendor row, and factor profile
-- row all read directly from prod (Neon project tiny-field-89581227) 2026-08-16; the USMCA factor
-- profile row (40b3690b-...) confirmed live with matching terms; the FACTORING_GL_POSTING_ENABLED
-- override for USMCA confirmed already active (set by the owner's own account, 2026-08-16, prior
-- to this migration) — this migration is what makes that already-active override actually resolve
-- to a real Faro binding instead of failing closed on missing_faro_agreement_binding.

BEGIN;

INSERT INTO mdata.vendors (
  id,
  operating_company_id,
  vendor_name,
  vendor_type,
  vendor_type_id,
  country,
  is_sample_data,
  source_system,
  notes
)
SELECT
  'a1f4c2b6-8e35-4f91-9c2d-6b7a58e0f3c4'::uuid,
  c.id,
  'Faro Factoring',
  'Other',
  vt.id,
  'US',
  false,
  'tms',
  'ACCT-F5332 — TMS-native Faro Factoring vendor record for USMCA, seeded 2026-08-16. Owner '
  || 'confirmed in chat: USMCA began factoring with Faro 2026-08-07, same terms as TRANSP. '
  || 'Mirrors TRANSP''s Faro vendor identity, not its QBO provenance — USMCA has no QuickBooks.'
FROM org.companies c
JOIN catalogs.vendor_types vt ON vt.operating_company_id = c.id AND vt.code = 'OTHER'
WHERE c.code = 'USMCA'
ON CONFLICT (id) DO NOTHING;

INSERT INTO factoring.canonical_factor_agreements (
  id,
  tenant_id,
  agreement_code,
  factor_profile_id,
  factor_vendor_id,
  is_full_recourse,
  fee_rate_tier1,
  fee_rate_tier2,
  reserve_rate,
  repurchase_term_days,
  grace_days,
  repurchase_deadline_days,
  default_interest_daily_rate,
  effective_from,
  effective_to
)
SELECT
  'd3b6f8a1-2c47-4e5a-9f01-8b6c4d2a7e19'::uuid,
  c.id,
  'FARO_FULL_RECOURSE_V1',
  '40b3690b-f1d4-44b4-90cf-c1cfd4f79c33'::uuid,
  'a1f4c2b6-8e35-4f91-9c2d-6b7a58e0f3c4'::uuid,
  true,
  0.0150,
  0.0200,
  0.0150,
  30,
  5,
  95,
  0.00067000,
  '2026-08-07'::date,
  NULL
FROM org.companies c
WHERE c.code = 'USMCA'
ON CONFLICT (id) DO NOTHING;

COMMIT;
