BEGIN;

ALTER TABLE mdata.customers
  ADD COLUMN IF NOT EXISTS fmcsa_last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fmcsa_check_response JSONB;

COMMIT;
