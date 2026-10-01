-- 202615120000_work_orders_reported_in_shop_expected_release.sql
-- E-16 (ORDERS 2026-10-01 CC-1 row 3). Owner, verbatim: "all work orders must show and views report
-- date, date in shop, and expected release." Measured 2026-10-01 (ROUND 303 A-43): none of the three
-- existed as a column (opened_at is the WO open time, work_started_at is when work began, closed_at is
-- the actual close -- none is "reported", "arrived in shop" or "expected release"). Real nullable
-- columns, never derived; render "--" where not known. Additive; metadata-only ADD COLUMN (no default,
-- no rewrite); lock_timeout so it never queues behind live traffic.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS reported_at timestamptz,
  ADD COLUMN IF NOT EXISTS in_shop_at timestamptz,
  ADD COLUMN IF NOT EXISTS expected_release_at timestamptz;

COMMENT ON COLUMN maintenance.work_orders.reported_at IS 'When the problem was reported (owner: report date). NULL = not recorded.';
COMMENT ON COLUMN maintenance.work_orders.in_shop_at IS 'When the unit physically arrived in the shop (owner: date in shop). NULL = not recorded.';
COMMENT ON COLUMN maintenance.work_orders.expected_release_at IS 'Expected release from the shop -- an estimate, editable (owner: expected release). NULL = none given.';

COMMIT;
