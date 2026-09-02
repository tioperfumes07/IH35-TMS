-- GO-19-05 completion: 202613360001 added bill driver/trailer linkage but omitted the
-- recovery intent fields already carried by accounting.expenses. Additive and idempotent;
-- no existing row is reclassified and no deduction is created by this migration.
BEGIN;

ALTER TABLE accounting.bills
  ADD COLUMN IF NOT EXISTS recover_from_driver boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recover_deduction_type text;

COMMENT ON COLUMN accounting.bills.recover_from_driver IS
  'Operator intent to recover this bill from its linked driver; does not create a deduction automatically.';
COMMENT ON COLUMN accounting.bills.recover_deduction_type IS
  'Target driver deduction bucket type when recover_from_driver is true.';

COMMIT;
