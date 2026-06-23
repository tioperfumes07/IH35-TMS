-- FIX-7b ([HOLD-FOR-JORGE]) — render-v5 §D vendor mini-create: the 9 fields beyond the 4 that
-- mdata.qbo_vendors already stores (display_name / company_name / primary_email / primary_phone).
-- Additive, nullable, idempotent. No data change. mdata is already in the 0065 GRANT set + DEFAULT
-- PRIVILEGES, so new columns on this existing table inherit ih35_app grants — no new GRANT needed.
--
-- After this migrates, the follow-on (non-migration) work lights the fields end-to-end:
--   1. backend vendorCreateSchema (mdata/qbo-master-write.routes.ts) accepts the 9 fields + INSERT them.
--   2. QBO push mapping (qbo/push.service.ts vendor payload) maps address/terms/tax/1099/expense-acct.
--   3. frontend QuickCreateEntityModal vendor branch renders the 9 fields (FIX-7a added Company/Display).
-- None of those persist today, which is exactly why they were NOT fabricated in FIX-7a.

DO $$
BEGIN
  -- Billing address (Street / City / State / Zip)
  ALTER TABLE mdata.qbo_vendors ADD COLUMN IF NOT EXISTS billing_address_line1 TEXT;
  ALTER TABLE mdata.qbo_vendors ADD COLUMN IF NOT EXISTS billing_city TEXT;
  ALTER TABLE mdata.qbo_vendors ADD COLUMN IF NOT EXISTS billing_state TEXT;
  ALTER TABLE mdata.qbo_vendors ADD COLUMN IF NOT EXISTS billing_postal_code TEXT;

  -- Account no. · Terms
  ALTER TABLE mdata.qbo_vendors ADD COLUMN IF NOT EXISTS account_number TEXT;
  ALTER TABLE mdata.qbo_vendors ADD COLUMN IF NOT EXISTS terms TEXT;

  -- Tax ID (1099) · Track 1099?
  ALTER TABLE mdata.qbo_vendors ADD COLUMN IF NOT EXISTS tax_id TEXT;
  ALTER TABLE mdata.qbo_vendors ADD COLUMN IF NOT EXISTS track_1099 BOOLEAN NOT NULL DEFAULT FALSE;

  -- Default expense account — references a QBO account by its qbo_id (mirrored in mdata.qbo_accounts).
  ALTER TABLE mdata.qbo_vendors ADD COLUMN IF NOT EXISTS default_expense_account_qbo_id TEXT;
END $$;

COMMENT ON COLUMN mdata.qbo_vendors.track_1099 IS 'render-v5 §D: vendor is 1099-tracked';
COMMENT ON COLUMN mdata.qbo_vendors.default_expense_account_qbo_id IS 'render-v5 §D: default expense account (QBO account qbo_id)';
