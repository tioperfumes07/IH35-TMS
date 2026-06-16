-- FH-4 Finance Calculator — register the gated flag (default OFF).
-- Pure modeling-only calculator (monthly payment, total interest, payoff date, amortization preview,
-- two-scenario compare). It NEVER posts and writes NOTHING (no DB writes at all). This migration only
-- registers the OFF flag that gates the feature. Additive, idempotent. See spec 06-FH-4-CALCULATOR.

BEGIN;

INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES ('FINANCE_HUB_CALCULATOR_ENABLED',
        'FH-4 Finance Calculator (pure modeling; never posts; no DB writes). Default OFF.',
        false)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;

-- ROLLBACK: DELETE FROM lib.feature_flags WHERE flag_key='FINANCE_HUB_CALCULATOR_ENABLED';
