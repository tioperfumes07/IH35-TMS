-- [HOLD-FOR-JORGE — TIER 2]  FACT-PAR-2: NOA Stamp + Remit-To + Letter-of-Release lifecycle
-- Adds four additive NOA columns to factoring.factor (ALTER on existing table → owner-gated).
-- Creates factoring.letter_of_release for LOR lifecycle tracking.

BEGIN;

-- ── NOA config columns on factoring.factor ────────────────────────────────────
ALTER TABLE factoring.factor
  ADD COLUMN IF NOT EXISTS noa_stamp_text      text,
  ADD COLUMN IF NOT EXISTS noa_remit_to_name   text,
  ADD COLUMN IF NOT EXISTS noa_remit_to_addr   text,
  ADD COLUMN IF NOT EXISTS noa_remit_to_wire_ref text;

-- ── Letter-of-Release table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS factoring.letter_of_release (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES org.companies(id),
  factor_id            uuid NOT NULL REFERENCES factoring.factor(id),
  issued_date          date NOT NULL,
  effective_release_date date NOT NULL,
  released_by_user_id  uuid,
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_release_date >= issued_date)
);

CREATE INDEX IF NOT EXISTS idx_factoring_lor_factor
  ON factoring.letter_of_release (tenant_id, factor_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE factoring.letter_of_release ENABLE ROW LEVEL SECURITY;
ALTER TABLE factoring.letter_of_release FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS factoring_lor_tenant_scope ON factoring.letter_of_release;
CREATE POLICY factoring_lor_tenant_scope
  ON factoring.letter_of_release
  FOR ALL
  USING (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

-- ── Grants ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON factoring.letter_of_release TO neondb_owner;
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON factoring.letter_of_release TO ih35_app;

COMMIT;
