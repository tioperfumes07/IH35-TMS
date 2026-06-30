-- 202606300040_per_entity_posting_flags.sql
-- [HOLD-FOR-JORGE — TIER 1] Block 01: register BILL_GL_POSTING_ENABLED + WO_VOID_ENABLED in
-- lib.feature_flags, DEFAULT OFF, so they resolve PER-ENTITY via isEnabled() (lib.feature_flag_overrides
-- keyed on operating_company_id) instead of a global process.env read. NEVER self-merge — financial
-- posting control (§1.4).
--
-- Behind these flags: the bill->GL post route (bill-gl-draft.routes.ts) and the WO-void financial
-- reversal (work-orders.routes.ts settleWorkOrderFinancialLinkage). Both code paths now call
-- isEnabled(client, KEY, {operating_company_id}); registering the rows makes the flags manageable via
-- per-company overrides WITHOUT turning anything on. default_enabled=false -> isEnabled() returns false
-- for every entity until a per-entity override row is seeded. No behavior change. Idempotent.

BEGIN;

INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES
  ('BILL_GL_POSTING_ENABLED',
   'CHAIN-03: bill -> GL posting (Dr expense / Cr A/P). Resolved per-entity via overrides. Default OFF.',
   false),
  ('WO_VOID_ENABLED',
   'WO void -> reverse the linked bill/expense GL (postVoidReversal). Resolved per-entity via overrides. Default OFF.',
   false)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;

-- ROLLBACK:
-- DELETE FROM lib.feature_flags WHERE flag_key IN ('BILL_GL_POSTING_ENABLED','WO_VOID_ENABLED');
