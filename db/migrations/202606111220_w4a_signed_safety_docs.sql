-- W4A-SIGNED-SAFETY-DOCS: schema, tables, RLS, immutable signature enforcement, spine logging
-- Send→read→e-sign flow. Signed records are immutable (append-only enforcement).
-- Writes lifecycle events to events.event_log via events.log_event().
-- NULLIF RLS pattern. NON-FINANCIAL.

CREATE SCHEMA IF NOT EXISTS safetydoc;

-- ─── DOCUMENT ────────────────────────────────────────────────────────────────
-- Master document template (created by office/safety team)
CREATE TABLE IF NOT EXISTS safetydoc.document (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL,
  title                 text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  body_html             text NOT NULL,
  doc_type              text NOT NULL DEFAULT 'safety_policy'
                          CHECK (doc_type IN ('safety_policy','drug_test_consent','mvr_release','onboarding','custom')),
  version               integer NOT NULL DEFAULT 1,
  is_active             boolean NOT NULL DEFAULT true,
  created_by_user_id    uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  soft_deleted_at       timestamptz
);

ALTER TABLE safetydoc.document ENABLE ROW LEVEL SECURITY;

CREATE POLICY safetydoc_document_tenant ON safetydoc.document
  USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

CREATE INDEX IF NOT EXISTS idx_safetydoc_document_company_active
  ON safetydoc.document (operating_company_id, is_active, doc_type)
  WHERE soft_deleted_at IS NULL;

-- ─── ASSIGNMENT ───────────────────────────────────────────────────────────────
-- One row per document-to-driver send. Tracks sent→read→signed lifecycle.
-- Once status = 'signed', the row becomes immutable (enforced by trigger below).
CREATE TABLE IF NOT EXISTS safetydoc.assignment (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL,
  document_id           uuid NOT NULL REFERENCES safetydoc.document(id),
  driver_id             uuid NOT NULL,
  status                text NOT NULL DEFAULT 'sent'
                          CHECK (status IN ('sent','read','signed','expired','revoked')),

  -- Immutable once signed — these columns are set once and never changed
  signed_at             timestamptz,
  signed_by_driver_id   uuid,
  signature_data        text,   -- base64 canvas signature or typed-name hash
  signature_ip          text,
  signature_user_agent  text,

  -- Audit trail
  sent_at               timestamptz NOT NULL DEFAULT now(),
  read_at               timestamptz,
  expires_at            timestamptz,
  spine_event_id        uuid,
  is_active             boolean NOT NULL DEFAULT true,
  created_by_user_id    uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE safetydoc.assignment ENABLE ROW LEVEL SECURITY;

CREATE POLICY safetydoc_assignment_tenant ON safetydoc.assignment
  USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

CREATE INDEX IF NOT EXISTS idx_safetydoc_assignment_driver
  ON safetydoc.assignment (operating_company_id, driver_id, status, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_safetydoc_assignment_document
  ON safetydoc.assignment (document_id, status, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_safetydoc_assignment_unsigned
  ON safetydoc.assignment (operating_company_id, driver_id, is_active)
  WHERE status IN ('sent', 'read');

-- ─── IMMUTABILITY ENFORCEMENT ─────────────────────────────────────────────────
-- Once an assignment is signed, UPDATE/DELETE is blocked at the DB level.
-- Corrections require a new assignment row (same as spine pattern).
CREATE OR REPLACE FUNCTION safetydoc.enforce_signed_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status = 'signed' THEN
    RAISE EXCEPTION 'safetydoc.assignment: signed records are immutable — DELETE not allowed (assignment_id: %)', OLD.id;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'signed' THEN
    RAISE EXCEPTION 'safetydoc.assignment: signed records are immutable — UPDATE not allowed (assignment_id: %)', OLD.id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS enforce_signed_immutable ON safetydoc.assignment;
CREATE TRIGGER enforce_signed_immutable
  BEFORE UPDATE OR DELETE ON safetydoc.assignment
  FOR EACH ROW EXECUTE FUNCTION safetydoc.enforce_signed_immutable();

-- ─── updated_at TRIGGER ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION safetydoc.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_document ON safetydoc.document;
CREATE TRIGGER set_updated_at_document
  BEFORE UPDATE ON safetydoc.document
  FOR EACH ROW EXECUTE FUNCTION safetydoc.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_assignment ON safetydoc.assignment;
CREATE TRIGGER set_updated_at_assignment
  BEFORE UPDATE ON safetydoc.assignment
  FOR EACH ROW EXECUTE FUNCTION safetydoc.set_updated_at();

-- ─── SPINE LOGGING TRIGGER ───────────────────────────────────────────────────
-- Logs every assignment status transition to events.event_log via log_event().
CREATE OR REPLACE FUNCTION safetydoc.log_assignment_event()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_spine_event_id uuid;
  v_event_type text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'safetydoc.sent';
  ELSIF NEW.status = 'read' AND OLD.status != 'read' THEN
    v_event_type := 'safetydoc.read';
  ELSIF NEW.status = 'signed' AND OLD.status != 'signed' THEN
    v_event_type := 'safetydoc.signed';
  ELSE
    RETURN NEW;
  END IF;

  SELECT events.log_event(
    NEW.operating_company_id::text,
    v_event_type,
    'driver',
    COALESCE(NEW.signed_by_driver_id::text, NEW.driver_id::text),
    'safetydoc.assignment',
    NEW.id::text,
    jsonb_build_object(
      'document_id', NEW.document_id,
      'status', NEW.status,
      'driver_id', NEW.driver_id
    ),
    now(),
    'safetydoc'
  ) INTO v_spine_event_id;

  NEW.spine_event_id := v_spine_event_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_assignment_event ON safetydoc.assignment;
CREATE TRIGGER log_assignment_event
  BEFORE INSERT OR UPDATE ON safetydoc.assignment
  FOR EACH ROW EXECUTE FUNCTION safetydoc.log_assignment_event();

-- ─── GRANTS ───────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA safetydoc TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON safetydoc.document TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON safetydoc.assignment TO ih35_app;
