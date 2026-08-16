-- LV-SYSTEM-AUDIT-MASTER-DATA-SPINE-DROPPED
--
-- The immutable event spine already admits driver/unit subjects, but rejects the
-- equally canonical customer/vendor master records.  Their create routes therefore
-- could not write the System Audit Trail without lying under a generic subject type.
-- Widen the allowlist only; no historical row is rewritten and no grant changes.

DO $$
BEGIN
  ALTER TABLE events.event_log DROP CONSTRAINT IF EXISTS valid_subject_type;
  ALTER TABLE events.event_log ADD CONSTRAINT valid_subject_type CHECK (
    subject_type IN (
      'load', 'driver', 'unit', 'customer', 'vendor',
      'geofence', 'document', 'assignment', 'status', 'broker', 'task', 'alert',
      'invoice', 'bill', 'journal_entry'
    )
  );
END $$;

-- Keep the original nine-argument helper's validation aligned with the table.
-- The thirteen-argument helper used by application writers delegates validation to
-- the same CHECK, so both overloads now accept the identical canonical subjects.
CREATE OR REPLACE FUNCTION events.log_event(
    p_operating_company_id uuid,
    p_event_type text,
    p_actor_type text,
    p_actor_id uuid,
    p_subject_type text,
    p_subject_id uuid,
    p_payload jsonb DEFAULT '{}',
    p_occurred_at timestamptz DEFAULT now(),
    p_source text DEFAULT 'app'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_event_id uuid;
BEGIN
    IF p_event_type !~ '^[a-z]+\.[a-z_]+$' THEN
        RAISE EXCEPTION 'Invalid event_type format: %. Expected: domain.action', p_event_type;
    END IF;

    IF p_actor_type NOT IN ('user', 'driver', 'system', 'broker', 'unit', 'integration') THEN
        RAISE EXCEPTION 'Invalid actor_type: %', p_actor_type;
    END IF;

    IF p_subject_type NOT IN (
      'load', 'driver', 'unit', 'customer', 'vendor',
      'geofence', 'document', 'assignment', 'status', 'broker', 'task', 'alert',
      'invoice', 'bill', 'journal_entry'
    ) THEN
        RAISE EXCEPTION 'Invalid subject_type: %', p_subject_type;
    END IF;

    INSERT INTO events.event_log (
        operating_company_id, event_type, actor_type, actor_id,
        subject_type, subject_id, payload, occurred_at, source
    ) VALUES (
        p_operating_company_id, p_event_type, p_actor_type, p_actor_id,
        p_subject_type, p_subject_id, p_payload, p_occurred_at, p_source
    ) RETURNING event_id INTO v_event_id;

    RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION events.log_event(uuid, text, text, uuid, text, uuid, jsonb, timestamptz, text)
  IS 'Standardized append-only event spine writer; canonical master-data subjects included.';
