-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER] F9-03 — supersede Faro invoice lines instead of hard DELETE.
-- *** DO NOT RUN ON PROD via db:migrate. Owner/agent Neon-applies then ledger-backfills. ***
-- Faro daily re-import must retain prior line versions (secured-borrowing evidence). Cursor band.

BEGIN;

ALTER TABLE factor.faro_invoice_lines
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;
COMMENT ON COLUMN factor.faro_invoice_lines.superseded_at IS
  'F9-03 — set when a daily re-import replaces this line version. Never hard-DELETE factor money lines.';

ALTER TABLE factor.faro_invoice_lines
  ADD COLUMN IF NOT EXISTS superseded_reason text;
COMMENT ON COLUMN factor.faro_invoice_lines.superseded_reason IS
  'F9-03 — why the line was superseded (e.g. faro_daily_reimport). NULL while active.';

CREATE INDEX IF NOT EXISTS idx_faro_invoice_lines_import_active
  ON factor.faro_invoice_lines (daily_import_id)
  WHERE superseded_at IS NULL;

COMMIT;
