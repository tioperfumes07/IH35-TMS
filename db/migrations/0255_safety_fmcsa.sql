BEGIN;

CREATE TABLE IF NOT EXISTS safety.fmcsa_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  event_type TEXT NOT NULL,
  event_date DATE NOT NULL,
  section_reference TEXT NULL,
  details TEXT NOT NULL,
  voided_at TIMESTAMPTZ NULL,
  voided_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS safety.event_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  event_type TEXT NOT NULL,
  event_id UUID NOT NULL,
  document_type TEXT NOT NULL,
  voided_at TIMESTAMPTZ NULL,
  voided_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE safety.fmcsa_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.event_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fmcsa_events_tenant_scope ON safety.fmcsa_events;
CREATE POLICY fmcsa_events_tenant_scope
  ON safety.fmcsa_events
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS event_documents_tenant_scope ON safety.event_documents;
CREATE POLICY event_documents_tenant_scope
  ON safety.event_documents
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE OR REPLACE FUNCTION safety.prevent_fmcsa_events_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'safety.fmcsa_events is append-only; use voiding';
END
$$;

CREATE OR REPLACE FUNCTION safety.prevent_event_documents_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'safety.event_documents is append-only; use voiding';
END
$$;

DROP TRIGGER IF EXISTS trg_prevent_fmcsa_events_delete ON safety.fmcsa_events;
CREATE TRIGGER trg_prevent_fmcsa_events_delete
BEFORE DELETE ON safety.fmcsa_events
FOR EACH ROW
EXECUTE FUNCTION safety.prevent_fmcsa_events_delete();

DROP TRIGGER IF EXISTS trg_prevent_event_documents_delete ON safety.event_documents;
CREATE TRIGGER trg_prevent_event_documents_delete
BEFORE DELETE ON safety.event_documents
FOR EACH ROW
EXECUTE FUNCTION safety.prevent_event_documents_delete();

GRANT SELECT, INSERT, UPDATE, DELETE ON safety.fmcsa_events TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON safety.event_documents TO ih35_app;

COMMIT;
