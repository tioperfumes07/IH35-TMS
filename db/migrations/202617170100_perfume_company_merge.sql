-- PERFUME duplicate companies → one company — owner 2026-11-27 16:32 CT: "in vendors, leads, you have the same vendor multiple times,
-- instead of having a vendor and multiple contacts within a vendor … as vendor it is one company and contacts there are multiple".
-- Measured on production: 161 company names on more than one live row (334 extra rows) — chains entered once per store (The Vitamin
-- Shoppe 58, ULTA Beauty 36, Walgreens 34) and one company typed several ways ("Perfume Network" / "Perfume Network Inc.").
-- The merge (perfume/company-merge.service.ts) moves everything that points at a duplicate to the one company that stays, and keeps
-- each duplicate as that company's LOCATION: archived_at + merged_into_id set, its own address / phone / city untouched and shown on
-- the company. Never deleted; one history row per merge.
BEGIN;
ALTER TABLE perfume.contact_companies ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES perfume.contact_companies(id);
ALTER TABLE perfume.contact_companies ADD COLUMN IF NOT EXISTS merged_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_perfume_contact_companies_merged_into ON perfume.contact_companies (merged_into_id) WHERE merged_into_id IS NOT NULL;
COMMIT;
