-- LEAD 443.191 (CC-3) — live-defect guard F3 (apps/backend/src/audit/__tests__/live-defects-f1-f3.db.test.ts): every
-- user-schema view must be security_invoker=true, else it reads with the view OWNER's rights and bypasses the caller's
-- row-level security (cross-company leak).
-- ROOT CAUSE: 202616000100_factoring_views_exclude_voided_advances.sql (5fd5b44af3, #26850) re-created
-- views.factoring_recourse_at_risk and views.factoring_chargebacks_fees with CREATE OR REPLACE VIEW and no
-- WITH (security_invoker = true). CREATE OR REPLACE VIEW replaces the view's reloptions with the ones it names, so both
-- views lost the security_invoker that 202612970000 / 202613010000 / 202613080000 had set.
-- FIX: restore the option on both views. Option change only — the view bodies (voided advances excluded) are unchanged.
-- Idempotent (setting an already-set option is a no-op). History is not modified.
SET LOCAL lock_timeout = '60s';

ALTER VIEW views.factoring_recourse_at_risk SET (security_invoker = true);
ALTER VIEW views.factoring_chargebacks_fees SET (security_invoker = true);
