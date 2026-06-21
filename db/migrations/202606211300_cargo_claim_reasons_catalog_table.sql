-- Cargo Claim Reasons catalog table (catalog backlog #8 — greenfield, FINAL catalog).
--
-- Safety/legal-domain reference catalog classifying the root cause of a cargo claim (damage, shortage,
-- loss, etc.) for claims reporting. No table or endpoint existed before this; sibling safety catalogs
-- (civil_fine_types, complaint_types, dot_violation_types) live in catalogs.* and this follows the same
-- shape + RLS + GRANT conventions. Pure ADDITIVE new table — the table does not exist, so there is zero
-- existing data to touch. No ALTER, no DML on existing tables, no financial table.
--
-- Columns match what the backend route (apps/backend/src/catalogs/safety/cargo-claim-reasons.routes.ts)
-- reads/writes (no invention beyond the handler contract):
--   reason_code, display_name, description, claim_category, is_active, sort_order.
--
-- claim_category CHECK lists standard cargo-claim cause categories; NO hazmat category (CLAUDE.md: NO
-- hazmat fields anywhere): damage, shortage, loss, delay, temperature, contamination, theft,
-- concealed_damage, other.
--
-- Conventions (CLAUDE.md): server-generated PK, operating_company_id RLS scoping, per-entity policy
-- FOR ALL TO ih35_app, explicit GRANTs (a new table is NOT covered by the one-time GRANT ON ALL TABLES),
-- is_active soft-delete. Reversible: DROP TABLE catalogs.cargo_claim_reasons;
BEGIN;

CREATE TABLE IF NOT EXISTS catalogs.cargo_claim_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  reason_code text NOT NULL,
  display_name text NOT NULL,
  description text,
  claim_category text CHECK (
    claim_category IS NULL OR claim_category IN (
      'damage',
      'shortage',
      'loss',
      'delay',
      'temperature',
      'contamination',
      'theft',
      'concealed_damage',
      'other'
    )
  ),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, reason_code)
);

-- Read pattern: list per company ordered by sort_order, reason_code (the GET handler's ORDER BY).
CREATE INDEX IF NOT EXISTS idx_cargo_claim_reasons_company_order
  ON catalogs.cargo_claim_reasons (operating_company_id, sort_order, reason_code);

-- RLS: per-entity, identical shape to the other catalogs.* safety catalogs.
ALTER TABLE catalogs.cargo_claim_reasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cargo_claim_reasons_company ON catalogs.cargo_claim_reasons;
CREATE POLICY cargo_claim_reasons_company ON catalogs.cargo_claim_reasons
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

-- GRANTs: a NEW table is not covered by the one-time GRANT ON ALL TABLES — grant explicitly (mutable catalog,
-- full CRUD; soft-delete via is_active is app convention, DELETE kept for completeness).
GRANT USAGE ON SCHEMA catalogs TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.cargo_claim_reasons TO ih35_app;

COMMENT ON TABLE catalogs.cargo_claim_reasons IS
  'Cargo claim cause-reason catalog (backlog #8): reference list classifying why a cargo claim occurred, for claims/legal reporting. One row per (operating_company_id, reason_code). No hazmat category (per CLAUDE.md).';

COMMIT;
