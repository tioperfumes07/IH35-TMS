CREATE OR REPLACE FUNCTION audit.block_audit_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit.audit_events is append-only: % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_audit_events_update ON audit.audit_events;
CREATE TRIGGER trg_block_audit_events_update
BEFORE UPDATE ON audit.audit_events
FOR EACH ROW
EXECUTE FUNCTION audit.block_audit_events_mutation();

DROP TRIGGER IF EXISTS trg_block_audit_events_delete ON audit.audit_events;
CREATE TRIGGER trg_block_audit_events_delete
BEFORE DELETE ON audit.audit_events
FOR EACH ROW
EXECUTE FUNCTION audit.block_audit_events_mutation();
