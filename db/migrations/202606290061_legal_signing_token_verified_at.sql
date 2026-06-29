-- 202606290061_legal_signing_token_verified_at.sql
-- Tier-2 build-and-hold (legal.* schema — NOT accounting/catalogs; but it IS a migration, so NEVER self-merge).
--
-- Closes a HIGH-severity e-sign verification bypass: completePublicSigning gated the signer on
-- `verification_code_hash IS NULL` to mean "code was verified". But confirmPublicSigningVerification
-- NULLs that same column on SUCCESS, which is the SAME null state as a fresh token whose code was
-- never sent — so a never-verified sms/email token passed the gate and signed WITHOUT verification.
--
-- This column is POSITIVE PROOF of verification: confirmPublicSigningVerification sets verified_at = now()
-- on a successful code check, and completePublicSigning now requires verified_at IS NOT NULL for any
-- channel other than 'none'. Idempotent.
BEGIN;

ALTER TABLE legal.contract_signing_tokens
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

COMMIT;
