-- [HOLD-FOR-JORGE — TIER 1] BANKING-GL-COMPLETION — banking.transfers -> GL posting feature flag.
--
-- *** DO NOT RUN ON PROD without Jorge's explicit "OK to merge" (constitution §1.4). Flag stays OFF
-- at merge; enable is a per-entity owner override after Neon tie-out. ***
--
-- WHY: apps/backend/src/banking/transfers.service.ts createTransfer() previously only bumped the cached
-- banking.bank_accounts.current_balance_cents — a transfer (bank_to_bank, cc_payment, cash_deposit,
-- owner_contribution, owner_distribution) never touched the GL. The fix adds a new "transfer"
-- PostingSourceType to the EXISTING posting-engine (accounting/posting-engine.service.ts) — Dr
-- destination-account ledger / Cr source-account ledger, reusing postSourceTransaction (same
-- idempotency-key + transaction_source_links spine every other poster uses; NO new GL math). This
-- migration ONLY seeds the per-entity kill-switch that gates the call; the posting code itself ships
-- dark (createTransfer no-ops the post when the flag resolves false, which it always does with no
-- override — see lib.feature_flags.isEnabled: no row/no override => false).
--
-- SCOPE: flag seed ONLY. No schema/table change.
-- Idempotent (ON CONFLICT DO NOTHING). Never self-merge — show full SQL, wait for Jorge's "OK to merge".

BEGIN;

INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES (
  'TRANSFER_GL_POSTING_ENABLED',
  'BANKING-GL-COMPLETION: post banking.transfers (bank_to_bank / cc_payment / cash_deposit / owner_contribution / owner_distribution) to the GL — Dr destination-account ledger / Cr source-account ledger via postSourceTransaction(''transfer''). Per-entity override only (see lib/feature-flags/service.ts POSTING_FLAG_KEYS — matches the *_GL_POSTING_ENABLED pattern). Default OFF until Jorge reviews + Neon tie-out.',
  false
)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
