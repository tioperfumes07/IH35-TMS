-- GAP-IDEMP-KEYS (Tier 1 Trust, Block 3): HTTP idempotency keys for mutating financial endpoints.
--
-- Goal: every mutating financial endpoint becomes safe to retry. The client sends
--   Idempotency-Key: <uuid>; the server stores the key + response and a replay of the
--   same key returns the cached response with no side effects (24h TTL).
--
-- Access pattern: the idempotency middleware reads/writes this table via withLuciaBypass()
--   (app.bypass_rls=lucia), since the check runs outside the route's per-tenant transaction.
--   RLS + the operating_company_id policy below are defense-in-depth and satisfy the
--   verify:rls-operating-company-scope guard (every table with operating_company_id must
--   have RLS enabled + a policy referencing app.operating_company_id).
--
-- Additive + idempotent: IF NOT EXISTS on table/indexes, DROP POLICY IF EXISTS before CREATE.

BEGIN;

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  operating_company_id uuid NOT NULL,
  request_method text NOT NULL,
  request_path text NOT NULL,
  request_hash text NOT NULL,
  response_status int NOT NULL,
  response_body jsonb NOT NULL,
  resource_id uuid,
  resource_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  ttl_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

-- Cleanup cron scans by ttl_at; tenant audit/forensics scan by operating_company_id.
CREATE INDEX IF NOT EXISTS ix_idempotency_keys_ttl_at
  ON public.idempotency_keys (ttl_at);

CREATE INDEX IF NOT EXISTS ix_idempotency_keys_oci
  ON public.idempotency_keys (operating_company_id);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS idempotency_keys_tenant_scope ON public.idempotency_keys;
CREATE POLICY idempotency_keys_tenant_scope ON public.idempotency_keys
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);

GRANT SELECT, INSERT, DELETE ON public.idempotency_keys TO ih35_app;

COMMIT;

-- DOWN (manual rollback):
-- DROP TABLE IF EXISTS public.idempotency_keys;
