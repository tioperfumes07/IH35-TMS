-- P6-T11191 — Dispatch refinements: assignment reason/notes, load templates, stop extras.
-- Additive only (Invariant #24). RLS company-scoped.

BEGIN;

-- --- Extend assignment history for explicit reassign reason (P5-T17) ---
ALTER TABLE dispatch.load_assignment_history
  DROP CONSTRAINT IF EXISTS load_assignment_history_assignment_method_check;

ALTER TABLE dispatch.load_assignment_history
  ADD CONSTRAINT load_assignment_history_assignment_method_check
  CHECK (assignment_method IN (
    'full_form', 'quicksave', 'drag_drop', 'auto_reassign', 'manual_reassign'
  ));

ALTER TABLE dispatch.load_assignment_history
  ADD COLUMN IF NOT EXISTS reason_code text,
  ADD COLUMN IF NOT EXISTS notes text;

-- --- Load templates (P5-T21) ---
CREATE TABLE IF NOT EXISTS dispatch.load_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  name text NOT NULL,
  template_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_load_templates_company
  ON dispatch.load_templates (operating_company_id, name);

ALTER TABLE dispatch.load_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_load_templates_isolation ON dispatch.load_templates;
CREATE POLICY rls_load_templates_isolation
  ON dispatch.load_templates
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dispatch.load_templates TO ih35_app;

-- Note: UI "customs" stop maps to mdata.stop_type_enum 'border' unless 'customs' is added in a separate migration.

ALTER TABLE mdata.load_stops
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS signature_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS photo_required boolean NOT NULL DEFAULT false;

-- Manual dispatcher ETA (P5-T20); when set, GET dispatch ETA returns source=manual.
ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS dispatcher_eta_at timestamptz NULL;

COMMIT;
