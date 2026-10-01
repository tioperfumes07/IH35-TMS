-- 202615180200_bank_account_tieouts.sql
-- ROUND 313 CC-1 #2 — BANK-TIEOUT-01: every live bank account's feed (closing) balance must equal the GL balance of
-- its ledger_account_id, or the difference must be explained line by line. One row per account per day, written
-- by apps/backend/src/banking/bank-tieout.service.ts (re-running a day refreshes that day's row). The feed
-- keeps only the CURRENT balance (banking.bank_accounts.current_balance_cents), so history accrues forward from
-- the first run — past days are never back-filled with invented balances. No DELETE grant.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS banking.bank_account_tieouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  bank_account_id uuid NOT NULL REFERENCES banking.bank_accounts(id),
  ledger_account_id uuid,
  tieout_date date NOT NULL,
  feed_balance_cents bigint NOT NULL,
  feed_synced_at timestamptz,
  gl_balance_cents bigint,
  diff_cents bigint,
  feed_only_cents bigint NOT NULL DEFAULT 0,
  feed_only_count integer NOT NULL DEFAULT 0,
  gl_only_cents bigint NOT NULL DEFAULT 0,
  gl_only_count integer NOT NULL DEFAULT 0,
  unexplained_cents bigint,
  tolerance_cents bigint NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('tied', 'explained', 'unexplained', 'no_gl_account')),
  explained_by jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_account_tieouts_gl_needed CHECK (status = 'no_gl_account' OR (ledger_account_id IS NOT NULL AND gl_balance_cents IS NOT NULL AND diff_cents IS NOT NULL AND unexplained_cents IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_account_tieouts_one_per_day ON banking.bank_account_tieouts (bank_account_id, tieout_date);
CREATE INDEX IF NOT EXISTS bank_account_tieouts_company_day ON banking.bank_account_tieouts (operating_company_id, tieout_date DESC);

ALTER TABLE banking.bank_account_tieouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE banking.bank_account_tieouts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bank_account_tieouts_company_isolation ON banking.bank_account_tieouts;
CREATE POLICY bank_account_tieouts_company_isolation ON banking.bank_account_tieouts
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON banking.bank_account_tieouts TO ih35_app;

COMMENT ON TABLE banking.bank_account_tieouts IS
  'BANK-TIEOUT-01: per account per day — feed balance vs ledger_account_id GL balance, diff, feed-only and GL-only lines, unexplained remainder.';

COMMIT;
