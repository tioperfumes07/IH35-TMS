-- BLOCK-04 / CHAIN-06 GAP #1 — register the INVOICE_AR_GL_POSTING_ENABLED feature flag, DEFAULT OFF.
-- Behind it: the invoice -> A/R accrual posting (DR ar_control / CR income + sales_tax_payable) that
-- today can post LIVE via the generic posting-engine-mvp/post route with NO per-entity kill switch.
-- This migration ONLY inserts the flag row (no GL math, no schema/column change). isEnabled() returns
-- false unless a per-entity override is set (lib.feature_flag_overrides), so registering the row is a
-- no-op for behavior — it just makes the flag manageable and gives the post route a switch to check.
-- Mirrors EXPENSE_GL_POSTING_ENABLED (202606151700) / BILL_GL_POSTING_ENABLED. Idempotent. Default OFF.

BEGIN;

INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES (
  'INVOICE_AR_GL_POSTING_ENABLED',
  'CHAIN-06: invoice issue -> A/R accrual GL posting (DR ar_control / CR per-line income + sales_tax_payable). Per-entity override; resolved in-handler. Default OFF (kill switch).',
  false
)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;

-- ROLLBACK: DELETE FROM lib.feature_flags WHERE flag_key='INVOICE_AR_GL_POSTING_ENABLED';
