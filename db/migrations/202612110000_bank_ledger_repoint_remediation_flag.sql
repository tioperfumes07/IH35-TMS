-- Register the per-entity kill switch for the bank-ledger repoint remediation.
--
-- The remediation (apps/backend/src/banking/bank-ledger-repoint-remediation.service.ts) reverses and
-- reposts bank-feed journal entries that were written through a WRONG bank-leg bridge — on prod, the
-- 121 Amex postings that hit "Faro Factoring Reserves" instead of the Amex card liability. It touches
-- live ledger history, so it must not be reachable until an entity is deliberately opted in.
--
-- DEFAULT OFF, rollout 0%. With no row present, `isEnabled` cannot resolve the key and the service is
-- a no-op returning reason='flag_off'; registering it here makes the switch EXIST and stay off, rather
-- than leaving the gate depending on a missing row. Per-entity flips go in lib.feature_flag_overrides
-- — never by raising default_enabled, which would arm every entity at once.
--
-- Additive · idempotent · no money moves · posts no GL.

BEGIN;

-- lib.feature_flags is RLS-protected and the runtime role is not a member of any entity for a global
-- flag row, so a plain INSERT raises "new row violates row-level security policy". The bypass branch is
-- the sanctioned path for migration-time master data (same as 202611250000 / 202611260000).
SET LOCAL app.bypass_rls = 'lucia';

INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'BANK_LEDGER_REPOINT_REMEDIATION_ENABLED',
  'Reverse+repost bank-feed JEs whose posted bank leg disagrees with the bank account''s CURRENT ledger_account_id (i.e. entries written before a bridge was corrected). Reuses the posting engine — no hand-written JE. Strict no-op while any in-scope bank account is still class-mismatched. Per-entity overrides only; OFF until the owner opts an entity in.',
  false,
  0
)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
