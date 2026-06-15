-- GAP-EXPENSES Phase 2 Step 3 — register the EXPENSE_GL_POSTING_ENABLED feature flag, DEFAULT OFF.
-- Behind it: the explicit Post-to-GL action + the reversing-JE void (expenses.routes.ts).
-- isEnabled() returns false either way; registering the row makes the flag manageable
-- (per-company/user overrides) without flipping it on. No behavior change. Idempotent.

BEGIN;

INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES (
  'EXPENSE_GL_POSTING_ENABLED',
  'GAP-EXPENSES Phase 2: expense -> GL posting (cash-basis: DR expense / CR bank|AP) + reversing-JE void. Default OFF.',
  false
)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;

-- ROLLBACK: DELETE FROM lib.feature_flags WHERE flag_key='EXPENSE_GL_POSTING_ENABLED';
