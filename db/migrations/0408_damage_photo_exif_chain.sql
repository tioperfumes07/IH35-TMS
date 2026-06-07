-- GAP-40: damage photo EXIF + chain-of-custody (WF-058)
BEGIN;

CREATE TABLE IF NOT EXISTS documents.damage_photo_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  damage_incident_id uuid NOT NULL REFERENCES safety.incidents(id) ON DELETE CASCADE,
  r2_object_key text NOT NULL,
  sha256_hash text NOT NULL,
  exif_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  custody_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_damage_photo_custody_events_array CHECK (jsonb_typeof(custody_events) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_damage_photo_evidence_incident
  ON documents.damage_photo_evidence (operating_company_id, damage_incident_id);

ALTER TABLE documents.damage_photo_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_damage_photo_evidence ON documents.damage_photo_evidence;
CREATE POLICY rls_damage_photo_evidence ON documents.damage_photo_evidence
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON documents.damage_photo_evidence TO ih35_app;

ALTER TABLE safety.incidents
  ADD COLUMN IF NOT EXISTS evidence_uuids uuid[] NOT NULL DEFAULT '{}';

COMMIT;
