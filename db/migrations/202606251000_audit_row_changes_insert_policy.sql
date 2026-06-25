-- 202606251000 — Add the missing INSERT RLS policy to audit.row_changes.
--
-- ROOT CAUSE (GUARD + coder, prod read-only): audit.row_changes has FORCE RLS (relforcerowsecurity=t)
-- and ONLY a SELECT policy (audit_row_changes_tenant_scope, polcmd='r'). There is NO INSERT policy, and
-- ih35_app is NOT a BYPASSRLS role. Under FORCE RLS + non-bypass role + no INSERT policy, every INSERT is
-- default-denied — NOT a missing-GUC issue: the QBO push worker correctly sets app.bypass_rls=lucia +
-- app.operating_company_id and writes tenant_id = operating_company_id. The policy simply never existed.
-- The denied insert runs in the SAME txn as the QBO entity push (qbo-customers/vendors/accounts), so it
-- ABORTS the whole push → QBO customer/vendor/account sync has been silently failing (qbo.sync.failed).
--
-- FIX: add a narrow INSERT-only, tenant-scoped policy. Least-privilege + append-only + entity-separation:
--   - FOR INSERT only → grants no UPDATE/DELETE; append-only audit invariant stays intact.
--   - WITH CHECK binds the inserted tenant_id to the session GUC (app.operating_company_id) → a worker can
--     only write audit rows for its own tenant; NO cross-entity audit writes.
--   - DELIBERATELY OMITS the SELECT policy's "OR is_lucia_bypass()". On WRITE the bypass path must NOT be
--     able to tag a row to the wrong tenant — stricter on write than read, intentionally.
--   - Does NOT modify/drop the existing SELECT policy (read isolation unchanged).
-- Idempotent (DROP POLICY IF EXISTS first). Fresh-DB CI safe (self-contained; needs audit.row_changes +
-- the ih35_app role, both created by earlier migrations).
--
-- GATED: financial-integrity / audit-RLS surface → [HOLD-FOR-JORGE]. Branch-test (positive + negatives) by
-- the coder; Jorge applies to prod (endpoint API-verified). NEVER self-merge / self-apply.

BEGIN;

DROP POLICY IF EXISTS audit_row_changes_insert_tenant ON audit.row_changes;
CREATE POLICY audit_row_changes_insert_tenant ON audit.row_changes
  FOR INSERT TO ih35_app
  WITH CHECK (tenant_id::text = current_setting('app.operating_company_id', true));

COMMIT;
