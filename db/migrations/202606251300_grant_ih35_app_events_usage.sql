-- [HOLD-FOR-JORGE] Drift-repair: grant the runtime role ih35_app USAGE on schema `events`.
--
-- ROOT CAUSE (prod read-only, confirmed 2026-06-25 + GUARD): has_schema_privilege('ih35_app','events',
-- 'USAGE') = FALSE. ih35_app has EXECUTE on events.log_event (both overloads) but was NEVER granted
-- USAGE on schema events — 0065 (the canonical GRANT migration) omitted `events`, and no later migration
-- added it. (Contrast: ih35_app correctly HAS USAGE on schema audit and accounting.)
--
-- A schema-qualified call `SELECT events.log_event(...)` requires BOTH USAGE on the schema AND EXECUTE on
-- the function. Missing USAGE => "permission denied for schema events" => the calling transaction aborts.
-- This breaks EVERY events.log_event caller running as ih35_app at runtime — the driver-request spine emit
-- (emitDriverRequestSpineEvent) and the #1440 Book-Load cash-advance spine emit. Same §2 landmine class as
-- the audit.row_changes RLS gap: "new schema -> add GRANTs or it 500s at runtime."
--
-- This makes a fresh-DB build reproduce the INTENDED prod grant (events alongside audit/accounting).
-- Append-only invariant is unaffected: USAGE on a schema confers NO table DML; events.event_log
-- immutability (202606111051_w1a_event_log_immutable revokes UPDATE/DELETE) stands. Idempotent: GRANT is a
-- no-op when the privilege is already held. Role-guarded so a roleless fresh DB does not error.
--
-- NOTE (Neon branch-test, 2026-06-25): USAGE clears the schema-permission barrier, but it is NECESSARY-
-- NOT-SUFFICIENT for the spine emit. events.log_event has TWO overloads — the 9-arg is SECURITY DEFINER;
-- the 13-arg one emitDriverRequestSpineEvent calls is NOT (secdef=false), so (a) it inserts as the caller
-- ih35_app (may also need INSERT on events.event_log) and (b) it has a separate TYPE bug: it inserts
-- p_actor_id (text) into event_log.actor_id (uuid) with no cast, so it fails for ALL callers regardless of
-- value (proven on a prod-copy branch with NULL and a uuid). Fixing #1440's e2e needs THIS grant PLUS a
-- function fix (cast p_actor_id::uuid / use p_actor_user_id / route to the definer overload) — see PR notes.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    GRANT USAGE ON SCHEMA events TO ih35_app;
  END IF;
END $$;
