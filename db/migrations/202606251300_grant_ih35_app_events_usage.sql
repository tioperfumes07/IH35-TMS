-- [HOLD-FOR-JORGE — TIER 1] Spine-emit drift-repair: (1) grant ih35_app USAGE on schema `events`, and
-- (2) fix the 13-arg events.log_event overload so the driver/dispatch/accounting/banking/maintenance/
-- settlement spines can actually write. Bundled per Jorge's decision so ONE apply unbreaks the whole spine.
--
-- ROOT CAUSE — BLOCKER 1 (permission): has_schema_privilege('ih35_app','events','USAGE') = FALSE on prod.
-- ih35_app has EXECUTE on events.log_event but was NEVER granted USAGE on schema events (0065 omitted it;
-- no later migration added it; contrast: audit + accounting USAGE are correctly granted). A schema-qualified
-- `SELECT events.log_event(...)` needs USAGE + EXECUTE; missing USAGE => "permission denied for schema
-- events" => the calling txn aborts. Same §2 landmine class as the audit.row_changes RLS gap.
--
-- ROOT CAUSE — BLOCKER 2 (function type bug): the 13-arg events.log_event overload was prosecdef=FALSE and
-- inserted p_actor_id (TEXT) into event_log.actor_id (UUID NOT NULL) — and p_subject_id (TEXT) into
-- subject_id (UUID) — with NO cast, so it FAILED for every caller regardless of value (proven on a prod-copy
-- Neon branch with NULL and a uuid: 'column "actor_id" is of type uuid but expression is of type text').
-- The whole spine (driver-request / dispatch / accounting / banking / maintenance / settlement emits) has
-- been silently broken. Verified ALL 13-arg callers pass opts.actor_user_id (a USER UUID) as BOTH p_actor_id
-- (text) and p_actor_user_id (uuid) — i.e. actor_id semantically IS the actor's user uuid; no caller passes
-- a non-uuid actor (no 'system'/service string). So routing actor_id from the uuid param is correct + safe.
--
-- FIX (GUARD Option C): recreate the 13-arg overload as SECURITY DEFINER (matching the proven 9-arg
-- overload, owner neondb_owner — so ih35_app needs no INSERT on event_log; the owner does the write) and
-- derive the uuid columns from the uuid inputs: actor_id := COALESCE(p_actor_user_id, NULLIF(p_actor_id,'')
-- ::uuid) (NOT NULL satisfied — all callers supply a user uuid), subject_id := NULLIF(p_subject_id,'')::uuid.
-- Signature is byte-for-byte unchanged so every caller binds without code changes. The 9-arg overload is NOT
-- touched. Append-only invariant intact (no UPDATE/DELETE; w1a immutability stands). Idempotent + role-guarded.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    GRANT USAGE ON SCHEMA events TO ih35_app;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION events.log_event(
  p_operating_company_id  text,
  p_event_type            text,
  p_actor_type            text,
  p_actor_id              text,
  p_subject_type          text,
  p_subject_id            text,
  p_payload               jsonb       DEFAULT '{}',
  p_occurred_at           timestamptz DEFAULT now(),
  p_source                text        DEFAULT NULL,
  p_source_table          text        DEFAULT NULL,
  p_source_reference_id   uuid        DEFAULT NULL,
  p_actor_user_id         uuid        DEFAULT NULL,
  p_correlation_id        uuid        DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
-- public is required: the events.event_log append-only trigger calls pgcrypto digest(), which lives in
-- public. (The proven 9-arg overload sets no search_path and relies on the session path including public;
-- we set it explicitly, pg_catalog first, and add public for digest.)
SET search_path = pg_catalog, events, public
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
    -- FIX: actor_id is uuid NOT NULL. The actor IS the user; every caller passes the user uuid as both
    -- p_actor_id (text) and p_actor_user_id (uuid). Prefer the typed uuid param; fall back to casting the
    -- text param (always a uuid string for current callers). Was: p_actor_id (text) -> type error.
    COALESCE(p_actor_user_id, NULLIF(p_actor_id, '')::uuid),
    p_subject_type,
    -- FIX: subject_id is uuid; cast the text param (was inserted raw -> the next type error after actor_id).
    NULLIF(p_subject_id, '')::uuid,
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
