-- CAP-11-DASHCAM: store Samsara-hosted clip metadata and linkage to harsh events.
BEGIN;

CREATE SCHEMA IF NOT EXISTS telematics;

CREATE TABLE IF NOT EXISTS telematics.dashcam_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  triggered_at timestamptz NOT NULL,
  duration_sec int NOT NULL CHECK (duration_sec > 0 AND duration_sec <= 600),
  camera_facing text NOT NULL CHECK (camera_facing IN ('road', 'in_cab', 'both')),
  samsara_clip_url text NOT NULL,
  samsara_clip_id text NOT NULL,
  trigger_kind text NOT NULL CHECK (trigger_kind IN ('harsh_event', 'on_demand', 'dvr_pull')),
  linked_harsh_event_id uuid NULL,
  retention_expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dashcam_clips_tenant_clip_unique UNIQUE (operating_company_id, samsara_clip_id)
);

DO $$
BEGIN
  IF to_regclass('safety.harsh_events') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'dashcam_clips_linked_harsh_event_fkey'
        AND conrelid = 'telematics.dashcam_clips'::regclass
    ) THEN
      ALTER TABLE telematics.dashcam_clips
        ADD CONSTRAINT dashcam_clips_linked_harsh_event_fkey
        FOREIGN KEY (linked_harsh_event_id) REFERENCES safety.harsh_events(id);
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dashcam_clips_unit_time
  ON telematics.dashcam_clips (operating_company_id, unit_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_dashcam_clips_harsh_event
  ON telematics.dashcam_clips (operating_company_id, linked_harsh_event_id)
  WHERE linked_harsh_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION telematics.block_dashcam_clips_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'telematics.dashcam_clips is append-only — % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_dashcam_clips_update ON telematics.dashcam_clips;
CREATE TRIGGER trg_block_dashcam_clips_update
BEFORE UPDATE ON telematics.dashcam_clips
FOR EACH ROW
EXECUTE FUNCTION telematics.block_dashcam_clips_mutation();

DROP TRIGGER IF EXISTS trg_block_dashcam_clips_delete ON telematics.dashcam_clips;
CREATE TRIGGER trg_block_dashcam_clips_delete
BEFORE DELETE ON telematics.dashcam_clips
FOR EACH ROW
EXECUTE FUNCTION telematics.block_dashcam_clips_mutation();

ALTER TABLE telematics.dashcam_clips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dashcam_clips_company_scope ON telematics.dashcam_clips;
CREATE POLICY dashcam_clips_company_scope ON telematics.dashcam_clips
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

REVOKE UPDATE, DELETE ON telematics.dashcam_clips FROM PUBLIC;
REVOKE UPDATE, DELETE ON telematics.dashcam_clips FROM ih35_app;
GRANT USAGE ON SCHEMA telematics TO ih35_app;
GRANT SELECT, INSERT ON telematics.dashcam_clips TO ih35_app;

COMMIT;
