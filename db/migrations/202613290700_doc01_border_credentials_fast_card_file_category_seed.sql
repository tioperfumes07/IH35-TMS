-- DOC-01 remainder (GO-1405, owner packet IH35-FINISH-2026-08-29/CC-1): the packet names 4 border
-- ops credential types with no upload surface -- MX license, visa, passport, FAST. Live-confirmed
-- catalogs.file_categories already has real seeded rows for 3 of the 4 (mexican_federal_license,
-- visa, passport, all applies_to={driver}); a FAST card category was simply never seeded. This
-- migration adds the one missing catalog row -- no code path is broken by its absence today, but
-- BorderCredentialsSection.tsx's upload wiring (this same PR) needs a real category to file FAST
-- card documents under, matching the pattern the other 3 credential types already use.
--
-- typical_expiration_months=60 (5 years) matches real-world CBP Trusted Traveler FAST card validity.
--
-- Idempotent: ON CONFLICT (code) DO NOTHING against the existing UNIQUE (code) constraint.

INSERT INTO catalogs.file_categories (
  code,
  label,
  description,
  applies_to,
  typical_expiration_months,
  requires_expiration_date,
  is_active
)
VALUES (
  'fast_card',
  'FAST Card (Free and Secure Trade)',
  'CBP Trusted Traveler border-crossing credential for commercial drivers.',
  ARRAY['driver'],
  60,
  true,
  true
)
ON CONFLICT (code) DO NOTHING;
