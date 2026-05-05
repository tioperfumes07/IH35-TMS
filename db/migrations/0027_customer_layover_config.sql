BEGIN;

ALTER TABLE mdata.customers
  ADD COLUMN IF NOT EXISTS layover_charge_per_day NUMERIC(10, 2)
    CHECK (layover_charge_per_day IS NULL OR layover_charge_per_day >= 0),
  ADD COLUMN IF NOT EXISTS layover_currency TEXT
    CHECK (layover_currency IS NULL OR layover_currency IN ('USD', 'MXN', 'CAD')),
  ADD COLUMN IF NOT EXISTS layover_first_night_free BOOLEAN
    NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS layover_max_days INT
    CHECK (layover_max_days IS NULL OR layover_max_days > 0),
  ADD COLUMN IF NOT EXISTS layover_notes TEXT;

COMMENT ON COLUMN mdata.customers.layover_charge_per_day IS
  'Daily charge billed to customer when driver held at customer location overnight beyond normal detention. Industry standard $250-500/day. Null = use carrier default rate.';
COMMENT ON COLUMN mdata.customers.layover_currency IS
  'Currency for layover charge. USD default; MXN for Mexican customers, CAD for Canadian.';
COMMENT ON COLUMN mdata.customers.layover_first_night_free IS
  'Industry standard varies: some customers expect first night included in detention rate; others charge layover from night 1. Default true = first night does NOT trigger layover (common practice).';
COMMENT ON COLUMN mdata.customers.layover_max_days IS
  'Optional cap on consecutive layover days billed. Some contracts cap at N days regardless of actual time held. Null = no cap.';
COMMENT ON COLUMN mdata.customers.layover_notes IS
  'Free-text notes about layover billing arrangement specific to this customer (e.g., approval thresholds, special escalation contact).';

COMMIT;
