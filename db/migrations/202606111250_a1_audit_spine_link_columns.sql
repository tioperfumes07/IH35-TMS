-- A1-AUDIT-SPINE-LINK-COLUMNS: add source linkage + correlation columns to event_log
-- Additive only — all new columns are NULLABLE with no default.
-- NO backfill of history (events are immutable — never rewrite past rows).
-- Extends events.log_event() to accept optional linkage params (backward compatible).
-- Confirms immutability trigger still RAISES on UPDATE/DELETE after this migration.

-- ─── STEP 1: ADD COLUMNS (additive, safe) ────────────────────────────────────
ALTER TABLE events.event_log
  ADD COLUMN IF NOT EXISTS source_table        text,
  ADD COLUMN IF NOT EXISTS source_reference_id uuid,
  ADD COLUMN IF NOT EXISTS actor_user_id       uuid,
  ADD COLUMN IF NOT EXISTS correlation_id      uuid;

-- ─── STEP 2: INDEXES ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_event_log_source
  ON events.event_log (source_table, source_reference_id)
  WHERE source_table IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_log_entity
  ON events.event_log (subject_type, subject_id)
  WHERE subject_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_log_actor_user
  ON events.event_log (operating_company_id, actor_user_id, occurred_at DESC)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_log_correlation
  ON events.event_log (correlation_id)
  WHERE correlation_id IS NOT NULL;

-- ─── STEP 3: VERIFY IMMUTABILITY TRIGGER IS STILL INTACT ────────────────────
-- This is a read-only check — it will RAISE if the trigger does not exist,
-- alerting migration runners that the spine immutability guard is missing.
DO $$
DECLARE
  v_trigger_count integer;
BEGIN
  SELECT count(*) INTO v_trigger_count
  FROM information_schema.triggers
  WHERE event_object_schema = 'events'
    AND event_object_table  = 'event_log'
    AND trigger_name = 'event_log_append_only';

  IF v_trigger_count = 0 THEN
    RAISE EXCEPTION 'A1-AUDIT: immutability trigger on events.event_log is MISSING — spine integrity broken';
  END IF;
END;
$$;

-- ─── STEP 4: EXTEND log_event() — backward-compatible new overload ───────────
-- Existing callers use the old signature (no new params) — they keep working.
-- New callers can pass source_table, source_reference_id, correlation_id.
CREATE OR REPLACE FUNCTION events.log_event(
  p_operating_company_id  text,
  p_event_type            text,
  p_actor_type            text,
  p_actor_id              text,
  p_subject_type          text,
  p_subject_id            text,
  p_payload               jsonb    DEFAULT '{}',
  p_occurred_at           timestamptz DEFAULT now(),
  p_source                text    DEFAULT NULL,
  p_source_table          text    DEFAULT NULL,
  p_source_reference_id   uuid    DEFAULT NULL,
  p_actor_user_id         uuid    DEFAULT NULL,
  p_correlation_id        uuid    DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
  v_company_id uuid;
BEGIN
  v_company_id := NULLIF(p_operating_company_id, '')::uuid;

  INSERT INTO events.event_log (
    operating_company_id,
    event_type,
    actor_type,
    actor_id,
    subject_type,
    subject_id,
    payload,
    occurred_at,
    source,
    source_table,
    source_reference_id,
    actor_user_id,
    correlation_id
  ) VALUES (
    v_company_id,
    p_event_type,
    p_actor_type,
    p_actor_id,
    p_subject_type,
    p_subject_id,
    p_payload,
    p_occurred_at,
    p_source,
    p_source_table,
    p_source_reference_id,
    p_actor_user_id,
    p_correlation_id
  )
  RETURNING event_id INTO v_id;

  RETURN v_id;
END;
$$;
