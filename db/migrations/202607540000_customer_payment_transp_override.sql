-- [HOLD-FOR-JORGE — B3-AR] TRANSP override for CUSTOMER_PAYMENT_GL_POSTING_ENABLED.
--
-- *** DO NOT RUN ON PROD without Jorge's explicit approval. Build-and-HOLD; owner applies on Neon branch
-- and ledger-backfills so prod db:migrate skips it. ***
--
-- WHY: TRANSP invoices post A/R but customer payments currently post no GL JE, causing A/R to overstate.
-- Seeding an entity override for CUSTOMER_PAYMENT_GL_POSTING_ENABLED on TRANSP makes customer-payment GL
-- posting consistent with invoicing for the operating carrier.
--
-- Idempotent: ON CONFLICT DO UPDATE SET enabled = true. No schema change.

BEGIN;

DO $seed$
BEGIN
  PERFORM set_config('app.bypass_rls', 'lucia', true);

  INSERT INTO lib.feature_flag_overrides
    (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
  SELECT
    'CUSTOMER_PAYMENT_GL_POSTING_ENABLED',
    '91e0bf0a-133f-4ce8-a734-2586cfa66d96', -- TRANSP
    NULL::uuid,
    true,
    owner_user.id
  FROM identity.users owner_user
  WHERE owner_user.role = 'Owner'
    AND owner_user.deactivated_at IS NULL
    AND owner_user.archived_at IS NULL
  ORDER BY owner_user.created_at
  LIMIT 1
  ON CONFLICT (flag_key, operating_company_id)
    WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
  DO UPDATE SET
    enabled          = true,
    set_by_user_uuid = EXCLUDED.set_by_user_uuid,
    set_at           = now();
END
$seed$;

COMMIT;

-- ROLLBACK (owner-run only):
-- DELETE FROM lib.feature_flag_overrides
--  WHERE flag_key = 'CUSTOMER_PAYMENT_GL_POSTING_ENABLED'
--    AND operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96';
