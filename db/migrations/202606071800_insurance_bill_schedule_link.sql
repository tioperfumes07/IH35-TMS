-- Block 5 / GAP-86 — Insurance bill schedule link
-- Adds vendor_id to insurance.policy (links insurer to accounting vendor for bill generation)
-- Adds bill_uuid to insurance.payment_schedule (links each installment to accounting.bills)
BEGIN;

ALTER TABLE insurance.policy
  ADD COLUMN IF NOT EXISTS vendor_id TEXT NULL;

COMMENT ON COLUMN insurance.policy.vendor_id
  IS 'Accounting vendor ID for the insurer — used to generate accounting.bills via createBill()';

ALTER TABLE insurance.payment_schedule
  ADD COLUMN IF NOT EXISTS bill_uuid UUID NULL REFERENCES accounting.bills(id) ON DELETE SET NULL;

COMMENT ON COLUMN insurance.payment_schedule.bill_uuid
  IS 'Reference to accounting.bills row created by createBill() for this installment';

CREATE INDEX IF NOT EXISTS idx_insurance_policy_vendor_id
  ON insurance.policy (vendor_id)
  WHERE vendor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_insurance_payment_schedule_bill_uuid
  ON insurance.payment_schedule (bill_uuid)
  WHERE bill_uuid IS NOT NULL;

COMMIT;
