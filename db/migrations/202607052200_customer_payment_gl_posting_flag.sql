-- CHAIN-06 — register the CUSTOMER_PAYMENT_GL_POSTING_ENABLED feature flag, DEFAULT OFF.
-- Behind it: the customer-payment (A/R receipt) accrual posting (DR real-bank / CR ar_control) that
-- today posts LIVE on every payment apply via accounting/payments/apply.service.ts with NO per-entity
-- kill switch. This migration ONLY inserts the flag row (no GL math, no schema/column change).
-- isEnabled() returns false unless a per-entity override is set (lib.feature_flag_overrides), so
-- registering the row is a NO-OP for behavior — it just makes the flag manageable and gives the apply
-- path a switch to check. Mirrors INVOICE_AR_GL_POSTING_ENABLED (202607011500) /
-- BILL_GL_POSTING_ENABLED / BILL_PAYMENT_GL_POSTING_ENABLED. Idempotent. Default OFF.
--
-- OWNER DECISION (Jorge / CHAIN-06): whether to turn A/R-receipt posting ON per entity (or leave it
-- always-on) is his call. Seeding the flag OFF-by-default is the safe state; he flips the per-entity
-- override when the A/R tie-out is signed off. An agent NEVER flips this flag.

BEGIN;

INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES (
  'CUSTOMER_PAYMENT_GL_POSTING_ENABLED',
  'CHAIN-06: customer-payment (A/R receipt) GL posting (DR real-bank / CR ar_control) on payment apply. Per-entity override; resolved in apply.service. Default OFF (kill switch).',
  false
)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;

-- ROLLBACK: DELETE FROM lib.feature_flags WHERE flag_key='CUSTOMER_PAYMENT_GL_POSTING_ENABLED';
