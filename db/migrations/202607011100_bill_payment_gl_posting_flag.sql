-- 202607011100_bill_payment_gl_posting_flag.sql
-- [HOLD-FOR-JORGE — TIER 1] BLOCK-02 / CHAIN-04: register BILL_PAYMENT_GL_POSTING_ENABLED in
-- lib.feature_flags, DEFAULT OFF, so the bill-payment -> GL post entrypoint resolves PER-ENTITY via
-- isEnabled() (lib.feature_flag_overrides keyed on operating_company_id) instead of a global env read.
-- NEVER self-merge — financial posting control (§1.4).
--
-- Behind this flag: the bill-payment -> GL post route (bill-payment-gl.routes.ts) and the shared
-- entrypoint postBillPaymentGlIfEnabled(). Both resolve isEnabled(client, KEY, {operating_company_id}).
-- Registering the row makes the flag manageable via per-company overrides WITHOUT turning anything on:
-- default_enabled=false -> isEnabled() returns false for every entity until a per-entity override row is
-- seeded, so the poster NO-OPs. No behavior change. Idempotent. Mirrors 202606300040
-- (BILL_GL_POSTING_ENABLED, CHAIN-03).

BEGIN;

INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES
  ('BILL_PAYMENT_GL_POSTING_ENABLED',
   'CHAIN-04: bill-payment -> GL posting (Dr ap_control / Cr real bank via banking.bank_accounts.ledger_account_id). Resolved per-entity via overrides. Default OFF.',
   false)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;

-- ROLLBACK:
-- DELETE FROM lib.feature_flags WHERE flag_key = 'BILL_PAYMENT_GL_POSTING_ENABLED';
