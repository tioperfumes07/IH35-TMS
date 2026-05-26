BEGIN;

CREATE TABLE IF NOT EXISTS safety.citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  issued_at TIMESTAMPTZ NOT NULL,
  driver_id UUID NOT NULL,
  unit_id UUID NULL,
  citation_number TEXT NOT NULL,
  citation_type TEXT NOT NULL,
  disposition TEXT NOT NULL DEFAULT 'pending',
  voided_at TIMESTAMPTZ NULL,
  voided_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE safety.citations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS citations_tenant_scope ON safety.citations;
CREATE POLICY citations_tenant_scope
  ON safety.citations
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE OR REPLACE FUNCTION safety.prevent_citations_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'safety.citations is append-only; use voiding';
END
$$;

DROP TRIGGER IF EXISTS trg_prevent_citations_delete ON safety.citations;
CREATE TRIGGER trg_prevent_citations_delete
BEFORE DELETE ON safety.citations
FOR EACH ROW
EXECUTE FUNCTION safety.prevent_citations_delete();

GRANT SELECT, INSERT, UPDATE, DELETE ON safety.citations TO ih35_app;

COMMIT;
