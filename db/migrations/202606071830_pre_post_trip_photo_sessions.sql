-- GAP-50 — AI photo comparison pre/post trip damage detection
-- ADDITIVE ONLY. Consumes GAP-40 documents.damage_photo_evidence + EXIF chain.
-- Conventions: gen_random_uuid(), role ih35_app, RLS via app.operating_company_id.

BEGIN;

CREATE TABLE IF NOT EXISTS safety.photo_comparison_sessions (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  load_uuid uuid,
  driver_uuid uuid NOT NULL,
  unit_uuid uuid NOT NULL,
  pre_trip_session_at timestamptz NOT NULL,
  pre_trip_evidence_uuids uuid[] NOT NULL,
  post_trip_session_at timestamptz,
  post_trip_evidence_uuids uuid[],
  diff_status text NOT NULL DEFAULT 'pending' CHECK (
    diff_status IN ('pending', 'analyzing', 'clean', 'damage_detected', 'review_required', 'manual_override')
  ),
  diff_findings jsonb,
  diff_summary text,
  diff_completed_at timestamptz,
  auto_damage_report_uuid uuid REFERENCES safety.incidents(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pcs_load ON safety.photo_comparison_sessions (load_uuid);
CREATE INDEX IF NOT EXISTS idx_pcs_status ON safety.photo_comparison_sessions (diff_status);
CREATE INDEX IF NOT EXISTS idx_pcs_company_created
  ON safety.photo_comparison_sessions (operating_company_id, created_at DESC);

ALTER TABLE safety.photo_comparison_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.photo_comparison_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS photo_comparison_sessions_tenant_scope ON safety.photo_comparison_sessions;
CREATE POLICY photo_comparison_sessions_tenant_scope
  ON safety.photo_comparison_sessions
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE ON safety.photo_comparison_sessions TO ih35_app;

COMMIT;
