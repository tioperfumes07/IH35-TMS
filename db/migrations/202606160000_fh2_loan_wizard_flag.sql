-- FH-2 Loan Wizard — register the gated feature flag (default OFF).
-- Finance Hub centerpiece: one form → preview-first auto-creation of loan record, fixed asset +
-- depreciation, down-payment, amortization schedule, and a BALANCED opening JE. This migration
-- ONLY registers the OFF flag that gates the whole feature; the wizard ships preview/compute-only
-- (no posting, no GL writes) in its first PR. Posting is a LATER gated step behind this same flag.
-- Additive, idempotent. See docs spec 05-FH-2-LOAN-WIZARD.

BEGIN;

INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES ('FINANCE_HUB_LOAN_WIZARD_ENABLED',
        'FH-2 Loan Wizard (preview-first loan→asset→amortization→opening-JE generator). Default OFF.',
        false)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;

-- ROLLBACK: DELETE FROM lib.feature_flags WHERE flag_key='FINANCE_HUB_LOAN_WIZARD_ENABLED';
