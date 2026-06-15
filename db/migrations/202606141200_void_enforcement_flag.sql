-- VOID-EVERYWHERE PR-1 — feature flag only (default OFF). No schema or posting behavior changes.
-- When this flag is OFF (default, prod): the existing invoice/journal-entry void routes behave exactly as
--   they do today (status flip + audit) — nothing new posts.
-- When flipped ON (staging/test): voiding an invoice or journal entry posts an equal-and-opposite REVERSING
--   journal entry, dated at the original date if its accounting period is open, or in the CURRENT open period
--   if the original period is closed (never rewrites a closed period — respects the closed-period write-lock,
--   AI-1b #816). The record is marked VOIDED with reason + actor + timestamp; the audit spine records it.
--   VOID = Owner/Accountant only.
BEGIN;

INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'VOID_ENFORCEMENT_ENABLED',
  'VOID-EVERYWHERE: when ON, voiding an invoice or journal entry posts an equal-and-opposite reversing journal entry (original date if its period is open; current open period if the original period is closed — never rewrites a closed period), marks the record VOIDED with reason+actor, and writes the audit spine. VOID = Owner/Accountant only. Default OFF.',
  false,
  0
)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
