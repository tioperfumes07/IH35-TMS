-- *** HOLD-FOR-JORGE — DO NOT RUN ON PROD. STOP-GATE. Financial cluster (RLS-adjacent / events spine). ***
-- [HOLD-FOR-JORGE — TIER 1] P0 prerequisite — reconcile the events.event_log RLS GUC inside
-- events.log_event() itself, so FORCE ROW LEVEL SECURITY (the separate P0-a follow-up) becomes safe.
--
-- See docs/db-audit/P0-audit-log-rls-DESIGN.md (PR #2164) for the full writer-verification trail this
-- migration is the prerequisite fix for. THIS MIGRATION DOES NOT FORCE RLS. It does not touch the
-- events.event_log policies, does not change any grant, and does not flip any flag. FORCE RLS on
-- events.event_log remains a separate, later PR, to be authored only after this fix is live and
-- re-verified on a Neon branch per the design doc's own instructions.
--
-- ============================================================================================
-- ROOT CAUSE (verified 2026-07-05 against apps/backend/src + db/migrations, matches the design doc):
-- events.event_log has two RLS policies (migration 202606111050) that key on the GUC
-- `app.current_operating_company_id`:
--   event_log_tenant_isolation / event_log_tenant_insert
--   USING/WITH CHECK (operating_company_id = current_setting('app.current_operating_company_id', true)::uuid)
--
-- ALL writes funnel through the single 13-arg `events.log_event(...)` SECURITY DEFINER function
-- (owned by neondb_owner, migration 202606251300). Grepping every spine-emit caller of that function:
--   4 of 5 NEVER set `app.current_operating_company_id` before calling it — they rely entirely on
--   whatever the request middleware already put on the connection, which is the DIFFERENT GUC
--   `app.operating_company_id`:
--     apps/backend/src/accounting/accounting-spine-emit.ts
--     apps/backend/src/dispatch/dispatch-spine-emit.ts
--     apps/backend/src/banking/banking-spine-emit.ts
--     apps/backend/src/maintenance/maintenance-spine-emit.ts
--   Only apps/backend/src/driver-finance/driver-request-spine-emit.ts sets the event_log GUC itself
--   (txn-local, before calling log_event) — the other 4 do not.
--
-- Today this is silently masked because events.event_log is RLS ENABLED but NOT FORCED, so the table
-- OWNER (neondb_owner) — which is who the SECURITY DEFINER function runs as — bypasses RLS entirely
-- regardless of the GUC. The moment FORCE ROW LEVEL SECURITY is applied (the P0-a follow-up), the owner
-- becomes subject to the policy like any other role, `current_setting('app.current_operating_company_id',
-- true)` evaluates NULL on those 4 call sites' connections, and the WITH CHECK silently rejects the
-- INSERT — breaking the hash chain for the majority of production event volume (GL/settlement postings,
-- load lifecycle, bank reconciliation, work orders). That is the exact P0 finding this migration fixes.
--
-- FIX (single-place, Option A per the design doc's own numbering — the least invasive, most durable of
-- the two options it lists): rather than patching 4 separate TypeScript call sites (which a future 6th
-- caller could still forget), reconcile the GUC INSIDE `events.log_event()` itself — the one function
-- every one of the 5 spine paths already funnels through. Immediately before the INSERT the policies
-- gate, derive `app.current_operating_company_id` directly from this call's own
-- `p_operating_company_id` argument (the same value being written into the row's
-- `operating_company_id` column) via `set_config(..., true)` (txn-local — is_local=true, so it can
-- never leak past the current transaction/request and never needs to be reset). This makes every
-- caller correct BY CONSTRUCTION: the GUC the policy checks and the value being inserted can no longer
-- diverge, because one is now derived from the other in the same statement. No caller-side code change
-- is required — the fix covers all 5 current callers (and any future one) because the signature is
-- byte-for-byte unchanged (CREATE OR REPLACE FUNCTION, same 13 args, same name).
--
-- Guarded with `IF v_company_id IS NOT NULL THEN ... END IF;` so the NULL-company case behaves exactly
-- as before this migration (the INSERT still fails on the pre-existing `operating_company_id uuid NOT
-- NULL` constraint with the same error it always has) — this migration changes nothing about how a
-- malformed call fails, only how a well-formed call's GUC is scoped.
--
-- WHY NOT THE OTHER OPTIONS:
--   * Patching the 4 TypeScript files individually (the design doc's own "Option A") was considered and
--     rejected here as strictly weaker: it fixes today's 4 known gaps but not tomorrow's 6th caller. The
--     function-level fix in this migration is a superset — it also covers driver-request-spine-emit.ts
--     and driveralert.routes.ts etc. redundantly-but-harmlessly (they already set the same GUC to the
--     same value before calling in; this migration's set_config just re-sets it to the identical value
--     immediately before the INSERT, which is a no-op in effect).
--   * Repointing the two event_log policies at `app.operating_company_id` instead (or COALESCE-ing both
--     GUC names in the policy) was rejected for the same reason the design doc rejected it: that GUC is
--     shared across ~150+ RLS-scoped tables, so a policy-level change there has a much larger blast
--     radius than fixing the one function every event_log write already goes through. Fix the narrow
--     thing, not the shared thing.
--
-- WHAT THIS MIGRATION DOES NOT DO (by design — this is a prerequisite, not the RLS change itself):
--   * Does NOT force RLS on events.event_log. FORCE remains a separate follow-up PR, authored only after
--     this fix is live and re-verified on a Neon branch (insert one event per spine path, confirm all
--     succeed under a FORCE-RLS copy of the table, confirm the existing hash-chain-verify cron
--     (apps/backend/src/audit/audit-chain-verify.cron.service.ts) still validates).
--   * Does NOT change the event_log_tenant_isolation / event_log_tenant_insert policies.
--   * Does NOT change any GRANT.
--   * Does NOT touch the 9-arg events.log_event overload (unused by any current spine-emit caller —
--     verified all 5 bind to the 13-arg overload).
--
-- Idempotent: CREATE OR REPLACE FUNCTION, same name/signature/owner/security/search_path as
-- 202606251300 plus the added set_config call — safe to apply on a fresh DB (from 0001) and safe to
-- re-apply. Append-only invariant on events.event_log is untouched (no UPDATE/DELETE grant change; the
-- 202606111051 immutability trigger stands).

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
-- public. (Unchanged from 202606251300.)
SET search_path = pg_catalog, events, public
AS $$
DECLARE
  v_id uuid;
  v_company_id uuid;
BEGIN
  v_company_id := NULLIF(p_operating_company_id, '')::uuid;

  -- P0 GUC RECONCILIATION (this migration, 202607090000): the event_log RLS policies key on
  -- app.current_operating_company_id, but not every caller of this function sets it -- some only set
  -- the OTHER GUC app.operating_company_id via request middleware. Reconciled here, in the ONE place
  -- every caller funnels through: derive the RLS GUC directly from this call's own operating-company
  -- argument, immediately before the INSERT the policy gates below. txn-local (is_local=true) so it
  -- cannot leak past this transaction. This is the prerequisite for FORCE ROW LEVEL SECURITY on
  -- events.event_log (tracked separately as P0-a -- NOT applied by this migration). Guarded on
  -- IS NOT NULL so a malformed (NULL company) call still fails exactly as before, on the table's
  -- pre-existing NOT NULL constraint, not on a GUC-related error.
  IF v_company_id IS NOT NULL THEN
    PERFORM set_config('app.current_operating_company_id', v_company_id::text, true);
  END IF;

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
    -- unchanged from 202606251300: actor_id is uuid NOT NULL; prefer the typed uuid param, fall back
    -- to casting the text param (always a uuid string for current callers).
    COALESCE(p_actor_user_id, NULLIF(p_actor_id, '')::uuid),
    p_subject_type,
    -- unchanged from 202606251300: subject_id is uuid; cast the text param.
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
