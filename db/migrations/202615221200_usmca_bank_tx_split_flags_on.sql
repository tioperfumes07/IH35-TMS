-- CLAIM 202615221200 — Rule 50 USMCA: enable BANK_TX_SPLIT_ENABLED + BANK_TX_SPLIT_GL_POSTING_ENABLED.
--
-- LIVE PROOF (Neon tiny-field-89581227 / br-fancy-credit-akjnd07a, 2026-10-02T11:45Z):
--   Both flag rows exist in lib.feature_flags (default_enabled=false).
--   USMCA (5c854333-6ea5-4faa-af31-67cb272fef80) has NO company-wide override for either key
--   (LEFT JOIN lib.feature_flag_overrides … user_uuid IS NULL → usmca_override NULL).
--
-- Table banking.bank_transaction_splits is already live (202607110100). FE MatchDrawer resolve-diff
-- (BANK-F91020) already writes splits. Without these overrides, persist/commit/GL stay gated OFF
-- for USMCA despite Rule 50 ("every non-QBO flag ON for USMCA").
--
-- Additive · idempotent · CREATE-only · no DROP · no money invented · USMCA only.
-- QBO write-back stays OFF (these are not QBO_* flags).

BEGIN;

SET LOCAL app.bypass_rls = 'lucia';

DO $usmca_bank_tx_split$
DECLARE
  v_usmca uuid := '5c854333-6ea5-4faa-af31-67cb272fef80';
  v_setter uuid;
  v_key text;
BEGIN
  SELECT u.id
    INTO v_setter
  FROM identity.users u
  WHERE u.role = 'Owner'
    AND u.deactivated_at IS NULL
    AND u.archived_at IS NULL
  ORDER BY u.created_at
  LIMIT 1;

  IF v_setter IS NULL THEN
    RAISE EXCEPTION 'CLAIM 202615221200: no Owner user to stamp set_by_user_uuid';
  END IF;

  FOREACH v_key IN ARRAY ARRAY[
    'BANK_TX_SPLIT_ENABLED',
    'BANK_TX_SPLIT_GL_POSTING_ENABLED'
  ]
  LOOP
    IF NOT EXISTS (SELECT 1 FROM lib.feature_flags WHERE flag_key = v_key) THEN
      RAISE EXCEPTION 'CLAIM 202615221200: flag % missing from lib.feature_flags (seed 202607110100 first)', v_key;
    END IF;

    INSERT INTO lib.feature_flag_overrides
      (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at, expires_at)
    VALUES (gen_random_uuid(), v_key, v_usmca, NULL, true, v_setter, now(), NULL)
    ON CONFLICT (flag_key, operating_company_id)
      WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
      DO UPDATE SET
        enabled = true,
        set_by_user_uuid = EXCLUDED.set_by_user_uuid,
        set_at = now(),
        expires_at = NULL;
  END LOOP;
END
$usmca_bank_tx_split$;

COMMIT;
