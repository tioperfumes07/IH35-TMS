-- [HOLD-FOR-JORGE — TIER 1] BLOCK-03 — IFTA quarterly preparer extension:
-- TRIP=practical-miles-less-personal-conveyance methodology, a real jurisdiction tax-rate
-- catalog (reference.ifta_tax_rates, quarterly) replacing the JSON-file source of truth, and
-- explicit non-IFTA-jurisdiction (Mexico) visibility tracking.
--
-- *** DO NOT MERGE-AND-RUN. DO NOT RUN ON PROD. Run ONLY on a Neon branch by Jorge's hand,
--     then ledger-backfill so prod db:migrate skips it. Financial cluster (accounting-adjacent
--     tax computation + new GRANTs) — never self-merge per constitution §1.3/§1.4. ***
--
-- EXTENDS the existing IFTA v1 (migrations 0372/0373 — ifta.quarterly_preparations /
-- state_miles_by_quarter / state_gallons_by_quarter / state_tax_by_quarter — already live,
-- driving /reports/ifta-preparer). Does NOT rebuild it: every statement here is additive
-- (ADD COLUMN IF NOT EXISTS / new tables) on top of that existing shape.
--
-- WHAT CHANGES:
--   1. reference.ifta_tax_rates — a real DB catalog of quarterly per-jurisdiction diesel tax
--      rates (today this lives only in apps/backend/src/ifta/ifta-tax-rates.json). The
--      calculator (ifta-tax-calculator.ts, separate code PR) prefers this table and falls
--      back to the JSON file when a (jurisdiction, quarter, year) row is absent, so nothing
--      breaks before this migration is actually run.
--   2. reference.non_ifta_jurisdictions — a static (not quarter-keyed) list of jurisdiction
--      codes this carrier's lanes touch that are NOT IFTA members (Mexican states — Laredo↔
--      Mexico cross-border miles). Miles in these jurisdictions are tracked for FLEET-MILE
--      VISIBILITY ONLY; no IFTA fuel tax is owed on them (Mexico is outside the IFTA
--      Articles of Agreement, which covers the lower-48 US states + Canadian provinces only).
--   3. ifta.state_miles_by_quarter / ifta.state_tax_by_quarter get additive columns:
--      is_ifta_jurisdiction (denormalized from #2, so a report/UI never has to re-join to
--      know whether a row's tax is real or informational-only) and
--      personal_conveyance_deduction_miles + net_taxable_miles (the TRIP methodology below).
--   4. ifta.personal_conveyance_miles_by_quarter — per-unit personal-conveyance mileage for
--      the quarter, computed from hos.duty_status_events odometer deltas during
--      'personal_conveyance' duty-status segments (that duty status + its odometer_mi column
--      already exist — CAP-11, migration 0219 — this is a pure READ, no HOS schema change).
--   5. ifta.quarterly_preparations gets pdf_file_id/pdf_generated_at/pdf_render_template_version
--      (archives the generated return PDF into the existing docs.files/R2 spine — same reuse
--      pattern as every other renderer in this repo) + miles_methodology (records which
--      methodology produced the miles on this preparation, so a later CPA review of an
--      already-generated return never has to guess).
--
-- METHODOLOGY NOTE (flag, do not silently treat as settled — mirrors the 1099/1042-S design
-- doc's §9 pattern of surfacing CPA-facing judgment calls rather than deciding them here):
-- hos.duty_status_events has NO per-state location (only a free-text `location` column, no
-- state code / lat-lon), so personal-conveyance miles CANNOT be attributed to the specific
-- jurisdiction they occurred in from data alone. This migration/engine nets personal-
-- conveyance miles out **proportionally** across a unit's state-mile buckets for the quarter
-- (each state's deduction = its share of that unit's total practical miles × total PC miles).
-- This is a standard, defensible apportionment convention when granular attribution isn't
-- available, but it is still an approximation — Jorge/CPA should confirm this convention (or
-- specify a different one, e.g. attribute 100% of PC miles to the home/base jurisdiction)
-- before the first live IFTA return is filed off this engine. Not resolved here; surfaced.
--
-- Fresh-DB safe: guarded by to_regclass(...) IS NOT NULL where extending a table that (per
-- repo convention) might not exist on some intermediate CI snapshot; every DDL is
-- CREATE-only / ADD COLUMN IF NOT EXISTS / ON CONFLICT DO NOTHING. Never RAISEs.

BEGIN;

-- ── 1. reference.ifta_tax_rates — quarterly per-jurisdiction diesel tax rate catalog ─────
CREATE SCHEMA IF NOT EXISTS reference;

CREATE TABLE IF NOT EXISTS reference.ifta_tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_code text NOT NULL,
  jurisdiction_name text NULL,
  quarter smallint NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  year smallint NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  tax_rate_per_gallon numeric(10, 4) NOT NULL DEFAULT 0,
  surcharge_per_gallon numeric(10, 4) NOT NULL DEFAULT 0,
  source text NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jurisdiction_code, quarter, year)
);

CREATE INDEX IF NOT EXISTS idx_ifta_tax_rates_quarter
  ON reference.ifta_tax_rates (quarter, year);

-- Seed from the currently-live apps/backend/src/ifta/ifta-tax-rates.json (Q1-2026, Q2-2026) —
-- source: iftach.org tax matrix, as already cited in that file's _source field.
INSERT INTO reference.ifta_tax_rates (jurisdiction_code, quarter, year, tax_rate_per_gallon, source) VALUES
  ('AL',1,2026,0.29,'iftach.org'), ('AZ',1,2026,0.26,'iftach.org'), ('AR',1,2026,0.284,'iftach.org'),
  ('CA',1,2026,0.847,'iftach.org'), ('CO',1,2026,0.205,'iftach.org'), ('CT',1,2026,0.492,'iftach.org'),
  ('DE',1,2026,0.22,'iftach.org'), ('FL',1,2026,0.352,'iftach.org'), ('GA',1,2026,0.331,'iftach.org'),
  ('ID',1,2026,0.32,'iftach.org'), ('IL',1,2026,0.545,'iftach.org'), ('IN',1,2026,0.51,'iftach.org'),
  ('IA',1,2026,0.325,'iftach.org'), ('KS',1,2026,0.26,'iftach.org'), ('KY',1,2026,0.234,'iftach.org'),
  ('LA',1,2026,0.2,'iftach.org'), ('ME',1,2026,0.312,'iftach.org'), ('MD',1,2026,0.3675,'iftach.org'),
  ('MA',1,2026,0.24,'iftach.org'), ('MI',1,2026,0.278,'iftach.org'), ('MN',1,2026,0.286,'iftach.org'),
  ('MS',1,2026,0.184,'iftach.org'), ('MO',1,2026,0.17,'iftach.org'), ('MT',1,2026,0.2975,'iftach.org'),
  ('NE',1,2026,0.288,'iftach.org'), ('NV',1,2026,0.27,'iftach.org'), ('NH',1,2026,0.222,'iftach.org'),
  ('NJ',1,2026,0.425,'iftach.org'), ('NM',1,2026,0.21,'iftach.org'), ('NY',1,2026,0.405,'iftach.org'),
  ('NC',1,2026,0.403,'iftach.org'), ('ND',1,2026,0.23,'iftach.org'), ('OH',1,2026,0.47,'iftach.org'),
  ('OK',1,2026,0.19,'iftach.org'), ('OR',1,2026,0,'iftach.org'), ('PA',1,2026,0.741,'iftach.org'),
  ('RI',1,2026,0.34,'iftach.org'), ('SC',1,2026,0.28,'iftach.org'), ('SD',1,2026,0.28,'iftach.org'),
  ('TN',1,2026,0.27,'iftach.org'), ('TX',1,2026,0.2,'iftach.org'), ('UT',1,2026,0.314,'iftach.org'),
  ('VT',1,2026,0.31,'iftach.org'), ('VA',1,2026,0.298,'iftach.org'), ('WA',1,2026,0.494,'iftach.org'),
  ('WV',1,2026,0.357,'iftach.org'), ('WI',1,2026,0.329,'iftach.org'), ('WY',1,2026,0.24,'iftach.org'),
  ('AL',2,2026,0.29,'iftach.org'), ('AZ',2,2026,0.26,'iftach.org'), ('AR',2,2026,0.284,'iftach.org'),
  ('CA',2,2026,0.847,'iftach.org'), ('CO',2,2026,0.205,'iftach.org'), ('CT',2,2026,0.492,'iftach.org'),
  ('DE',2,2026,0.22,'iftach.org'), ('FL',2,2026,0.352,'iftach.org'), ('GA',2,2026,0.331,'iftach.org'),
  ('ID',2,2026,0.32,'iftach.org'), ('IL',2,2026,0.545,'iftach.org'), ('IN',2,2026,0.51,'iftach.org'),
  ('IA',2,2026,0.325,'iftach.org'), ('KS',2,2026,0.26,'iftach.org'), ('KY',2,2026,0.234,'iftach.org'),
  ('LA',2,2026,0.2,'iftach.org'), ('ME',2,2026,0.312,'iftach.org'), ('MD',2,2026,0.3675,'iftach.org'),
  ('MA',2,2026,0.24,'iftach.org'), ('MI',2,2026,0.278,'iftach.org'), ('MN',2,2026,0.286,'iftach.org'),
  ('MS',2,2026,0.184,'iftach.org'), ('MO',2,2026,0.17,'iftach.org'), ('MT',2,2026,0.2975,'iftach.org'),
  ('NE',2,2026,0.288,'iftach.org'), ('NV',2,2026,0.27,'iftach.org'), ('NH',2,2026,0.222,'iftach.org'),
  ('NJ',2,2026,0.425,'iftach.org'), ('NM',2,2026,0.21,'iftach.org'), ('NY',2,2026,0.405,'iftach.org'),
  ('NC',2,2026,0.403,'iftach.org'), ('ND',2,2026,0.23,'iftach.org'), ('OH',2,2026,0.47,'iftach.org'),
  ('OK',2,2026,0.19,'iftach.org'), ('OR',2,2026,0,'iftach.org'), ('PA',2,2026,0.741,'iftach.org'),
  ('RI',2,2026,0.34,'iftach.org'), ('SC',2,2026,0.28,'iftach.org'), ('SD',2,2026,0.28,'iftach.org'),
  ('TN',2,2026,0.27,'iftach.org'), ('TX',2,2026,0.2,'iftach.org'), ('UT',2,2026,0.314,'iftach.org'),
  ('VT',2,2026,0.31,'iftach.org'), ('VA',2,2026,0.298,'iftach.org'), ('WA',2,2026,0.494,'iftach.org'),
  ('WV',2,2026,0.357,'iftach.org'), ('WI',2,2026,0.329,'iftach.org'), ('WY',2,2026,0.24,'iftach.org')
ON CONFLICT (jurisdiction_code, quarter, year) DO NOTHING;

-- ── 2. reference.non_ifta_jurisdictions — static list; Mexico is NOT an IFTA jurisdiction ─
CREATE TABLE IF NOT EXISTS reference.non_ifta_jurisdictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_code text NOT NULL UNIQUE,
  jurisdiction_name text NOT NULL,
  country_code text NOT NULL DEFAULT 'MX',
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO reference.non_ifta_jurisdictions (jurisdiction_code, jurisdiction_name, country_code, notes) VALUES
  ('MX', 'Mexico (unspecified state)', 'MX', 'IFTA Articles of Agreement cover the 48 contiguous US states + Canadian provinces only — Mexico is outside IFTA. Miles here are tracked for fleet-mile visibility only; no IFTA fuel tax is owed.'),
  ('TAM', 'Tamaulipas, Mexico', 'MX', 'Primary cross-border lane jurisdiction (Laredo/Nuevo Laredo corridor). Not an IFTA jurisdiction.'),
  ('NL', 'Nuevo Leon, Mexico', 'MX', 'Not an IFTA jurisdiction.')
ON CONFLICT (jurisdiction_code) DO NOTHING;

-- ── 3. Additive columns on the existing v1 IFTA tables ───────────────────────────────────
DO $$
BEGIN
  IF to_regclass('ifta.state_miles_by_quarter') IS NOT NULL THEN
    ALTER TABLE ifta.state_miles_by_quarter
      ADD COLUMN IF NOT EXISTS is_ifta_jurisdiction boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS personal_conveyance_deduction_miles numeric(12, 3) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS net_taxable_miles numeric(12, 3) NULL;
  END IF;

  IF to_regclass('ifta.state_tax_by_quarter') IS NOT NULL THEN
    ALTER TABLE ifta.state_tax_by_quarter
      ADD COLUMN IF NOT EXISTS is_ifta_jurisdiction boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS personal_conveyance_deduction_miles numeric(12, 3) NOT NULL DEFAULT 0;
  END IF;

  IF to_regclass('ifta.quarterly_preparations') IS NOT NULL THEN
    ALTER TABLE ifta.quarterly_preparations
      ADD COLUMN IF NOT EXISTS miles_methodology text NOT NULL DEFAULT 'trip_practical_less_personal_conveyance',
      ADD COLUMN IF NOT EXISTS pdf_file_id uuid NULL REFERENCES docs.files(id),
      ADD COLUMN IF NOT EXISTS pdf_generated_at timestamptz NULL,
      ADD COLUMN IF NOT EXISTS pdf_render_template_version text NULL;
  END IF;
END
$$;

-- ── 4. ifta.personal_conveyance_miles_by_quarter — per-unit PC miles for the quarter ─────
CREATE TABLE IF NOT EXISTS ifta.personal_conveyance_miles_by_quarter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preparation_id uuid NOT NULL REFERENCES ifta.quarterly_preparations(id) ON DELETE CASCADE,
  unit_id uuid NULL REFERENCES mdata.units(id),
  miles numeric(12, 3) NOT NULL DEFAULT 0 CHECK (miles >= 0),
  source text NOT NULL DEFAULT 'hos_duty_status_odometer',
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (preparation_id, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_ifta_pc_miles_preparation
  ON ifta.personal_conveyance_miles_by_quarter (preparation_id);

ALTER TABLE ifta.personal_conveyance_miles_by_quarter ENABLE ROW LEVEL SECURITY;
ALTER TABLE ifta.personal_conveyance_miles_by_quarter FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ifta_pc_miles_company ON ifta.personal_conveyance_miles_by_quarter;
CREATE POLICY ifta_pc_miles_company ON ifta.personal_conveyance_miles_by_quarter
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR EXISTS (
      SELECT 1 FROM ifta.quarterly_preparations qp
      WHERE qp.id = preparation_id
        AND qp.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR EXISTS (
      SELECT 1 FROM ifta.quarterly_preparations qp
      WHERE qp.id = preparation_id
        AND qp.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    )
  );

-- ── 5. Grants ─────────────────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA reference TO ih35_app;
GRANT SELECT ON reference.ifta_tax_rates TO ih35_app;
REVOKE INSERT, UPDATE, DELETE ON reference.ifta_tax_rates FROM ih35_app;
GRANT SELECT ON reference.non_ifta_jurisdictions TO ih35_app;
REVOKE INSERT, UPDATE, DELETE ON reference.non_ifta_jurisdictions FROM ih35_app;

GRANT SELECT, INSERT, UPDATE ON ifta.personal_conveyance_miles_by_quarter TO ih35_app;
REVOKE DELETE ON ifta.personal_conveyance_miles_by_quarter FROM ih35_app;

-- ── 6. Feature flag — default OFF; when OFF the preparer wizard keeps using the pre-existing
--      JSON-rate + load_stops/samsara-only methodology (unchanged behavior) ────────────────
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'IFTA_TRIP_METHODOLOGY_ENABLED',
  'IFTA preparer uses TRIP=practical-miles-less-personal-conveyance methodology + the DB jurisdiction tax-rate catalog (reference.ifta_tax_rates) + explicit non-IFTA (Mexico) visibility rows, and archives the return as a PDF. DEFAULT OFF — owner/CPA-gated; the proportional PC-mile apportionment convention (see migration header) should be confirmed before first live filing.',
  false,
  0
)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
