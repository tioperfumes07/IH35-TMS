-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER] F9-02 — void bill_lines instead of hard DELETE.
-- *** DO NOT RUN ON PROD via db:migrate. Owner/agent Neon-applies then ledger-backfills. ***
-- Additive void columns so QBO AP bill puller can supersede orphan lines without destroying
-- money-record history (Rule 04 / void-not-delete). Cursor band 20260901xxxx.

BEGIN;

ALTER TABLE accounting.bill_lines
  ADD COLUMN IF NOT EXISTS voided_at timestamptz;
COMMENT ON COLUMN accounting.bill_lines.voided_at IS
  'F9-02 — set when a QBO puller marks the line superseded/orphan. Never hard-DELETE money lines.';

ALTER TABLE accounting.bill_lines
  ADD COLUMN IF NOT EXISTS voided_reason text;
COMMENT ON COLUMN accounting.bill_lines.voided_reason IS
  'F9-02 — why the line was voided (e.g. qbo_orphan_superseded). NULL while active.';

COMMIT;
