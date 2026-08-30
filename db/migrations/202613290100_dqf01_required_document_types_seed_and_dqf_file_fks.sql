-- DQF-01 (owner APP-DEFECT-REGISTER-2026-08-29 Root 2, BLOCK-CC-1-schema.txt Q2 steps 1-4) — the
-- driver qualification file does not follow 49 CFR 391.51. Q1's eight required items (cited, not
-- paraphrased): (1) employment application §391.21, (2) MVR from each licensing authority at
-- hire §391.23(a)(1), (3) road test cert / equivalent license / written statement §391.31(e) /
-- §391.33 / §391.44(d), (4) annual MVR inquiry §391.25(a), (5) annual review note §391.25(c)(2),
-- (6) medical examiner's certificate (+CDLIS MVR for CDL) §391.43(g), (7) SPE certificate /
-- medical exemption §391.49 / 49 CFR 381, (8) National Registry verification note §391.23(m).
-- §391.51(c): retain for the whole of employment plus three years after. §391.51(d): items 4, 5,
-- 6 and the medical-registry note may be removed three years after execution; the others may not.
--
-- LIVE STATE CONFIRMED BEFORE WRITING (Neon br-fancy-credit-akjnd07a, bypass_rls=lucia,
-- je_control=2214): compliance.required_document_types (entity_kind='driver', 3 rows per code,
-- one per operating_company_id -- USMCA/TRANSP/TRK) already seeds cdl, med_cert (§391.41), mvr
-- (§391.25 -- this is item 4's citation, the ANNUAL inquiry, not item 2's hire-time MVR),
-- clearinghouse, driver_application (§391.21 -- item 1), w9. GENUINELY MISSING against the 8:
-- item 2 (hire MVR, §391.23(a)(1) -- distinct from the existing 'mvr' row's §391.25 citation),
-- item 3 (road test), item 5 (annual review note), item 7 (SPE cert), item 8 (National Registry
-- note). Items 4 and 6 are already adequately covered by the existing 'mvr' and 'med_cert' rows
-- respectively -- not re-seeded, not re-cited, existing rows untouched.
--
-- safety.driver_qualification_files (1 live row, 0 orphans confirmed against mdata.drivers
-- before writing this) has item_name as free TEXT with no FK, no enum, no catalog -- exactly the
-- packet's finding. driver_id is a bare uuid with NO foreign key at all.
--
-- SCOPE (honest, not silently expanded): this migration builds Q2 steps 1-4 (seed catalog items,
-- add required_document_type_id FK, add driver_id FK, add retention fields). Step 5 (reconcile
-- the three competing vocabularies -- catalogs.file_categories.code, the hardcoded DQF_DOC_TYPES
-- array, compliance.required_document_types.code) is a larger, cross-cutting analysis-and-
-- migration task on its own and is NOT attempted here -- filed as its own follow-up on the board.
-- Q3 (the DQF create wizard UI, create->onboarding chain, required-document gate on driver
-- creation) is explicitly Cursor's per the packet -- not built here.
--
-- IDEMPOTENT: seed uses ON CONFLICT DO NOTHING against the table's own
-- UNIQUE(operating_company_id, entity_kind, code); ADD COLUMN IF NOT EXISTS + DO-block guarded
-- FK adds. No DROP, no data change to existing rows, no grant change (new columns on existing
-- tables inherit migration 0065's DEFAULT PRIVILEGES on the compliance/safety schemas).

BEGIN;

-- ── Step 1: seed the 5 genuinely-missing 391.51 items, all 3 entities, entity_kind='driver' ────
INSERT INTO compliance.required_document_types
  (operating_company_id, entity_kind, code, label, authority, enforcement, has_expiry, is_seed, is_active, sort_order)
SELECT oci, 'driver', code, label, authority, 'warn', has_expiry, true, true, sort_order
FROM (VALUES
  ('5c854333-6ea5-4faa-af31-67cb272fef80'::uuid),
  ('91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid),
  ('b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e'::uuid)
) AS companies(oci)
CROSS JOIN (VALUES
  ('mvr_hire', 'MVR from Licensing Authority (Hire)', 'FMCSA §391.23(a)(1)', false, 20),
  ('road_test', 'Road Test Certificate / Equivalent License / Written Statement', 'FMCSA §391.31(e), §391.33, §391.44(d)', false, 30),
  ('annual_review_note', 'Annual Review of Driving Record — Note', 'FMCSA §391.25(c)(2)', false, 50),
  ('spe_certificate', 'SPE Certificate / Medical Exemption', 'FMCSA §391.49, 49 CFR 381', true, 70),
  ('national_registry_verification', 'National Registry Verification — Note', 'FMCSA §391.23(m)', false, 80)
) AS items(code, label, authority, has_expiry, sort_order)
ON CONFLICT (operating_company_id, entity_kind, code) DO NOTHING;

-- ── Step 2+3: DQF file catalog FK + driver FK ────────────────────────────────────────────────
ALTER TABLE safety.driver_qualification_files
  ADD COLUMN IF NOT EXISTS required_document_type_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'driver_qualification_files_required_document_type_id_fkey'
       AND conrelid = 'safety.driver_qualification_files'::regclass
  ) THEN
    ALTER TABLE safety.driver_qualification_files
      ADD CONSTRAINT driver_qualification_files_required_document_type_id_fkey
      FOREIGN KEY (required_document_type_id) REFERENCES compliance.required_document_types(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'driver_qualification_files_driver_id_fkey'
       AND conrelid = 'safety.driver_qualification_files'::regclass
  ) THEN
    ALTER TABLE safety.driver_qualification_files
      ADD CONSTRAINT driver_qualification_files_driver_id_fkey
      FOREIGN KEY (driver_id) REFERENCES mdata.drivers(id);
  END IF;
END
$$;

-- ── Step 4: retention fields, §391.51(c)/(d) ─────────────────────────────────────────────────
-- executed_at: when the item was actually executed/obtained (distinct from created_at, the row's
-- own insert time -- a DQF item can be backfilled or corrected after the fact).
-- removable_after: the earliest date this item MAY be purged, per §391.51(d) -- NULL for items 1,
-- 2, 3, 7, 8 (never removable while employed + 3 years), computed for items 4/5/6/registry-note
-- once wired to a real employment-end date (not attempted here -- Cursor's DQF wizard is the
-- write path that will populate these per-row from the catalog's own retention policy).
-- retain_until: employment end + 3 years per §391.51(c); NULL until employment end is known.
ALTER TABLE safety.driver_qualification_files
  ADD COLUMN IF NOT EXISTS executed_at timestamptz,
  ADD COLUMN IF NOT EXISTS removable_after date,
  ADD COLUMN IF NOT EXISTS retain_until date;

COMMIT;
