-- ACCT-F180 (board card LV-TXN-018) — the idempotency store has NEVER stored a single row.
--
-- SYMPTOM, reproduced live on deployed e6343f4: POST /api/v1/accounting/bills twice with the SAME
-- Idempotency-Key returned 201 twice with two DIFFERENT bill ids, leaving two identical rows in
-- accounting.bills (bill_number 'CC3-BILL-0001', amount_cents 12345, same vendor, 295 ms apart).
-- That is DUPLICATED ACCOUNTS PAYABLE from a single retry, on an endpoint that 400s without an
-- Idempotency-Key -- i.e. it tells every caller retries are safe when they are not.
--
-- ROOT CAUSE — a missing GRANT, not a logic bug. public.idempotency_keys was created by
-- 202606071300_idempotency_keys.sql with:
--
--     GRANT SELECT, INSERT, DELETE ON public.idempotency_keys TO ih35_app;
--
-- but the store statement in apps/backend/src/middleware/idempotency.ts is an
-- INSERT ... ON CONFLICT (key) DO UPDATE SET ..., and PostgreSQL requires **both INSERT and UPDATE**
-- privileges for ON CONFLICT DO UPDATE. The privilege is checked when the statement is planned, so
-- it fails every single time regardless of whether the conflict path is ever taken.
--
-- Nothing else supplied the privilege: migration 0065 grants SELECT/INSERT/UPDATE/DELETE plus
-- DEFAULT PRIVILEGES across twenty schemas, and 'public' is NOT one of them. Verified against
-- db/migrations/ before writing this.
--
-- WHY IT STAYED INVISIBLE: the store call is wrapped in try/catch and treated as non-fatal --
-- correctly, since the response has already been sent and failing it would break a successful
-- financial write. But that meant a permission error that fires on EVERY request degraded to a log
-- line. The enforcement half was live and loud; the memory half had never once executed. The table
-- read n_tup_ins = 0 for its entire existence, which is the tell: not "rarely stored", NEVER stored.
--
-- ADDITIVE + IDEMPOTENT. A GRANT is not a schema change: no table, column, index, policy or data is
-- touched, and re-running is a no-op. RLS is unaffected -- the existing idempotency_keys_tenant_scope
-- policy already admits identity.is_lucia_bypass(), which is how the store connects, so the policy
-- was never the blocker and is deliberately left exactly as it is.
--
-- SCOPED DELIBERATELY: UPDATE on this one table only. No blanket grant on schema public and no
-- DEFAULT PRIVILEGES entry for it -- widening privileges across an entire schema to fix one
-- statement is how a targeted grant becomes a standing hole.

-- A SECOND CANDIDATE WAS INVESTIGATED AND IS NOT A DEFECT — recorded so nobody re-opens it.
-- This fix's own guard flagged owner.todays_attention_snapshot on its first run: also written with
-- ON CONFLICT DO UPDATE, and its creating migration (0405) writes no grants at all. But schema
-- `owner` IS fully granted -- USAGE, SELECT/INSERT/UPDATE/DELETE on all tables, and ALTER DEFAULT
-- PRIVILEGES so later tables inherit -- by 202606271510_f1_ih35app_grants_extend.sql, via a
-- format()-over-array loop the guard could not yet read. The guard was taught that idiom instead of
-- this migration granting something already granted. No second grant is needed and none is written.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    RETURN;
  END IF;

  -- 1. ACCT-F180 — required by INSERT ... ON CONFLICT DO UPDATE in middleware/idempotency.ts.
  IF to_regclass('public.idempotency_keys') IS NOT NULL THEN
    EXECUTE 'GRANT UPDATE ON public.idempotency_keys TO ih35_app';
  END IF;

END
$$;
