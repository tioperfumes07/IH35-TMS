-- STAGE 3 SCENARIO 1 (cont.) — complete the legal matter's linkage graph.
--
-- WHAT ALREADY EXISTED (verified on prod br-fancy-credit-akjnd07a — NOT rebuilt)
-- legal.matters already carries real FKs to: driver (mdata.drivers), safety incident
-- (safety.incidents), insurance claim (insurance.claim), lawsuit (insurance.lawsuit), unit
-- (mdata.units), equipment (mdata.equipment) and users. Migration 202612130000 added the cost side
-- (accounting.bills.legal_matter_id). Those are not touched here.
--
-- WHAT WAS MISSING — the three that break the chain
--   1. LOAD. A freight lawsuit almost always arises from a specific load — cargo damage, a late
--      delivery, an accident in transit. Without load_id the matter cannot reach the revenue, the
--      driver pay, the fuel or the customer behind the dispute, so "what happened on this trip" has to
--      be reassembled by hand from dates.
--   2. ACCIDENT. matters.incident_id points at `safety.incidents`. The accident record used elsewhere
--      in this system is `safety.accident_reports` (`safety.accidents` exists on prod but NO migration
--      creates it — prod-only drift, so a fresh database would not have it; the scenario tracker was
--      repointed for exactly this reason). An accident-driven matter therefore had no link to the
--      accident report itself.
--   3. EXPENSE. accounting.expenses carries load_id and insurance_claim_id but no legal_matter_id, so
--      a court fee or filing cost paid by card — rather than billed by the firm — never reached the
--      matter. Bills were covered by 202612130000; expenses are the other half of the same cost story.
--
-- POLICE REPORT — deliberately NOT a new table or column.
-- A police report is a DOCUMENT. `docs.file_links` already models entity-typed attachment
-- (entity_type / entity_id, soft-deleted), and it is currently empty, so nothing is being displaced.
-- Attaching the report with entity_type='legal_matter' (or to the accident report) reuses the existing
-- evidence path, its retention and its audit. Inventing legal.police_reports would create a second
-- document system for one document type and split evidence across two places — the opposite of §10a.
--
-- One migration rather than three: this is the SAME mechanical linkage change at three sites, which
-- §9.0.17 says to ship as one guarded sweep instead of fragmenting one decision across three reviews.
--
-- Additive · idempotent · nullable FKs · NO posting, NO flag, no money moves.

BEGIN;

-- ── 1. matter → load ──
ALTER TABLE legal.matters
  ADD COLUMN IF NOT EXISTS load_id uuid REFERENCES mdata.loads(id) ON DELETE SET NULL;

-- ── 2. matter → accident report (the migration-created table, not the prod-only drift one) ──
ALTER TABLE legal.matters
  ADD COLUMN IF NOT EXISTS accident_report_id uuid REFERENCES safety.accident_reports(id) ON DELETE SET NULL;

-- ── 3. expense → matter (mirrors bills.legal_matter_id from 202612130000) ──
ALTER TABLE accounting.expenses
  ADD COLUMN IF NOT EXISTS legal_matter_id uuid REFERENCES legal.matters(id);

-- Convergence for databases where a column already exists WITHOUT its constraint: ADD COLUMN
-- IF NOT EXISTS is a no-op there, so the inline REFERENCES above would never fire.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('legal',      'matters',  'load_id',            'matters_load_fk',            'mdata.loads(id) ON DELETE SET NULL'),
      ('legal',      'matters',  'accident_report_id', 'matters_accident_report_fk', 'safety.accident_reports(id) ON DELETE SET NULL'),
      ('accounting', 'expenses', 'legal_matter_id',    'expenses_legal_matter_fk',   'legal.matters(id)')
    ) AS t(sch, tbl, col, conname, target)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class k ON k.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = k.relnamespace
      WHERE n.nspname = r.sch AND k.relname = r.tbl AND c.contype = 'f'
        AND pg_get_constraintdef(c.oid) ILIKE '%' || r.col || '%'
    ) THEN
      EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s',
                     r.sch, r.tbl, r.conname, r.col, r.target);
    END IF;
  END LOOP;
END$$;

COMMENT ON COLUMN legal.matters.load_id IS
  'The load this matter arises from (cargo damage, late delivery, accident in transit). Nullable: employment and commercial matters have no load. Gives the matter reach into revenue, driver pay, fuel and customer.';
COMMENT ON COLUMN legal.matters.accident_report_id IS
  'The accident report behind this matter. Distinct from incident_id, which references safety.incidents; safety.accident_reports is the migration-created accident record (safety.accidents is prod-only drift and absent from a fresh database).';
COMMENT ON COLUMN accounting.expenses.legal_matter_id IS
  'The legal matter this expense was incurred on (court fees, filing costs paid by card rather than billed by the firm). Mirrors accounting.bills.legal_matter_id so both halves of legal spend reach the matter.';

-- Reverse lookups must not table-scan.
CREATE INDEX IF NOT EXISTS idx_matters_load_id
  ON legal.matters (load_id) WHERE load_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matters_accident_report_id
  ON legal.matters (accident_report_id) WHERE accident_report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_legal_matter_id
  ON accounting.expenses (legal_matter_id) WHERE legal_matter_id IS NOT NULL;

COMMIT;
