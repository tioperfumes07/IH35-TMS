-- [HOLD-FOR-JORGE — TIER 1] governance.void_cancel_requests — maker/checker for void & cancel.
--
-- Tier-1 FINANCIAL GOVERNANCE. Void/cancel EXECUTORS = Owner | Administrator | Accountant (canVoidCancel).
-- Everyone else must FILE a request that an executor approves/denies. Reason is REQUIRED on the request
-- (CHECK length >= 3) and on the decision. This is the generic, reusable request->approve workflow for
-- ALL void/cancel surfaces (Phase 1 wires entity_type='work_order'); modelled on identity.workflow_requests
-- (db/migrations/0007). void-not-delete: rows are append-then-decide + is_active soft-delete, never DELETEd.
-- Decisions land in the immutable audit spine (audit.audit_events) from the route, not here.
--
-- Idempotent + fresh-DB-safe (CREATE ... IF NOT EXISTS / DROP POLICY IF EXISTS). New schema `governance`
-- gets USAGE + DEFAULT PRIVILEGES for ih35_app (0065 grant pattern) or it 500s at runtime.
BEGIN;

CREATE SCHEMA IF NOT EXISTS governance;

CREATE TABLE IF NOT EXISTS governance.void_cancel_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  entity_type           text NOT NULL,                              -- e.g. 'work_order', 'invoice', 'bill', 'expense', 'journal_entry'
  entity_id             text NOT NULL,                              -- text: entity PKs are uuid today but some surfaces use composite/business ids
  action                text NOT NULL CHECK (action IN ('void', 'cancel')),
  reason                text NOT NULL CHECK (length(reason) >= 3),  -- WHY is always captured (Jorge 2026-06-29)
  status                text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  requested_by_user_id  uuid NOT NULL REFERENCES identity.users(id),
  requested_at          timestamptz NOT NULL DEFAULT now(),
  decided_by_user_id    uuid REFERENCES identity.users(id),
  decided_at            timestamptz,
  decision_reason       text,
  reversing_entry_ref   text,                                       -- reversing JE / reference produced when the void executes on approve
  is_active             boolean NOT NULL DEFAULT true,              -- standing rule: soft-delete, never DELETE
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_void_cancel_requests_status
  ON governance.void_cancel_requests (operating_company_id, status);
CREATE INDEX IF NOT EXISTS idx_void_cancel_requests_requested_by
  ON governance.void_cancel_requests (requested_by_user_id);
CREATE INDEX IF NOT EXISTS idx_void_cancel_requests_entity
  ON governance.void_cancel_requests (operating_company_id, entity_type, entity_id);

-- Tenant isolation (§4): scope every read/write to the operating company. Requester-vs-executor row
-- visibility is enforced in the route on top of this.
ALTER TABLE governance.void_cancel_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.void_cancel_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS void_cancel_requests_tenant_scope ON governance.void_cancel_requests;
CREATE POLICY void_cancel_requests_tenant_scope ON governance.void_cancel_requests
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);

-- New schema needs USAGE + table grants + DEFAULT PRIVILEGES for the runtime role (0065 pattern) or runtime 500s.
GRANT USAGE ON SCHEMA governance TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON governance.void_cancel_requests TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA governance GRANT SELECT, INSERT, UPDATE ON TABLES TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA governance GRANT USAGE, SELECT ON SEQUENCES TO ih35_app;

-- updated_at maintenance (self-contained; mirrors identity.set_updated_at).
CREATE OR REPLACE FUNCTION governance.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS void_cancel_requests_updated_at ON governance.void_cancel_requests;
CREATE TRIGGER void_cancel_requests_updated_at
BEFORE UPDATE ON governance.void_cancel_requests
FOR EACH ROW
EXECUTE FUNCTION governance.set_updated_at();

COMMIT;
