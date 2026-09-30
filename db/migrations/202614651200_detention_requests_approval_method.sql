-- ROUND 285.4.9 / #59 — APPROVED BY · METHOD on customer invoice.
-- Additive: capture how the detention/layover was approved (e.g. "by telephone call")
-- on dispatch.detention_requests so invoice PDF can print METHOD under each accessorial line.
-- Nullable for historical rows approved before this column existed (invoice prints blank METHOD).
-- New approvals REQUIRE the column via the approve route (application gate).
--
-- Self-contained GRANT; table-existence guard so CI verify DB without Block 6 is a clean no-op.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'dispatch' AND table_name = 'detention_requests'
  ) THEN
    ALTER TABLE dispatch.detention_requests
      ADD COLUMN IF NOT EXISTS approval_method text NULL;

    COMMENT ON COLUMN dispatch.detention_requests.approval_method IS
      'ROUND 285.4.9 #59 — how the reviewer approved this detention/layover (plain English, e.g. by telephone call). Printed on the customer invoice under APPROVED BY · METHOD. NULL only for rows approved before this column existed.';

    GRANT SELECT, INSERT, UPDATE ON dispatch.detention_requests TO ih35_app;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA dispatch TO ih35_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dispatch TO ih35_app;

COMMIT;
