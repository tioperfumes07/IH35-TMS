-- 202615190000_lease_engine_contract_bill_linkage.sql
-- ROUND 316 CC-1 — LEASE ENGINE. Owner 2026-10-01: every unit is leased to USMCA; the owner creates each lease
-- contract himself (backdated) once the engine is complete; lessor = IH 35 Trucking or IH 35 Transportation AS A
-- VENDOR; one vendor bill per lessor per month with a line per unit/trailer (class = unit, lease expense account).
-- Measured 2026-10-01: accounting.lease_contract 0 rows; lessor was free text; no bill <-> lease link; bill_lines had
-- no unit / trailer / class column. Additive, nullable, idempotent; lock_timeout so it never queues.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- Contract: lessor as a vendor, signing, deposit, escalation, type, expense account, owner-only close.
ALTER TABLE accounting.lease_contract ADD COLUMN IF NOT EXISTS lessor_vendor_id uuid REFERENCES mdata.vendors(id);
ALTER TABLE accounting.lease_contract ADD COLUMN IF NOT EXISTS lease_type text;
ALTER TABLE accounting.lease_contract ADD COLUMN IF NOT EXISTS signed_at timestamptz;
ALTER TABLE accounting.lease_contract ADD COLUMN IF NOT EXISTS signed_by_user_id uuid REFERENCES identity.users(id);
ALTER TABLE accounting.lease_contract ADD COLUMN IF NOT EXISTS deposit_cents bigint;
ALTER TABLE accounting.lease_contract ADD COLUMN IF NOT EXISTS escalation_pct_bps integer;
ALTER TABLE accounting.lease_contract ADD COLUMN IF NOT EXISTS escalation_every_months integer;
ALTER TABLE accounting.lease_contract ADD COLUMN IF NOT EXISTS expense_account_id uuid REFERENCES catalogs.accounts(id);
ALTER TABLE accounting.lease_contract ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE accounting.lease_contract ADD COLUMN IF NOT EXISTS closed_by_user_id uuid REFERENCES identity.users(id);
ALTER TABLE accounting.lease_contract ADD COLUMN IF NOT EXISTS close_reason text;
-- Owner 2026-10-01: at contract creation the owner chooses ONE BILL PER UNIT or ONE BILL FOR ALL UNITS.
ALTER TABLE accounting.lease_contract ADD COLUMN IF NOT EXISTS billing_mode text;

-- Asset line: its own monthly amount and dates (a unit can join or leave a contract mid-term).
ALTER TABLE accounting.lease_asset_line ADD COLUMN IF NOT EXISTS monthly_amount_cents bigint;
ALTER TABLE accounting.lease_asset_line ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE accounting.lease_asset_line ADD COLUMN IF NOT EXISTS end_date date;

-- Bill <-> lease, both ways. The bill carries the lessor + lease month; each line carries its contract, asset line,
-- unit or trailer and class (class = unit).
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS lease_period_start date;
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS lease_contract_id uuid REFERENCES accounting.lease_contract(id);
-- Idempotency key of a lease bill: 'C:<contract>:<yyyy-mm>' (one bill for all units) or
-- 'A:<asset line>:<yyyy-mm>' (one bill per unit). One live bill per key.
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS lease_bill_key text;
ALTER TABLE accounting.bill_lines ADD COLUMN IF NOT EXISTS lease_contract_id uuid REFERENCES accounting.lease_contract(id);
ALTER TABLE accounting.bill_lines ADD COLUMN IF NOT EXISTS lease_asset_line_id uuid REFERENCES accounting.lease_asset_line(id);
ALTER TABLE accounting.bill_lines ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES mdata.units(id);
ALTER TABLE accounting.bill_lines ADD COLUMN IF NOT EXISTS equipment_id uuid REFERENCES mdata.equipment(id);
ALTER TABLE accounting.bill_lines ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES catalogs.classes(id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lease_contract_lease_type_check' AND conrelid = 'accounting.lease_contract'::regclass) THEN
    ALTER TABLE accounting.lease_contract ADD CONSTRAINT lease_contract_lease_type_check
      CHECK (lease_type IS NULL OR lease_type IN ('truck_lease', 'trailer_lease', 'lease_to_own')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lease_contract_billing_mode_check' AND conrelid = 'accounting.lease_contract'::regclass) THEN
    ALTER TABLE accounting.lease_contract ADD CONSTRAINT lease_contract_billing_mode_check
      CHECK (billing_mode IS NULL OR billing_mode IN ('one_bill_per_unit', 'one_bill_all_units')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lease_contract_close_needs_reason' AND conrelid = 'accounting.lease_contract'::regclass) THEN
    ALTER TABLE accounting.lease_contract ADD CONSTRAINT lease_contract_close_needs_reason
      CHECK (closed_at IS NULL OR (close_reason IS NOT NULL AND btrim(close_reason) <> '')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lease_asset_line_amount_nonneg' AND conrelid = 'accounting.lease_asset_line'::regclass) THEN
    ALTER TABLE accounting.lease_asset_line ADD CONSTRAINT lease_asset_line_amount_nonneg
      CHECK (monthly_amount_cents IS NULL OR monthly_amount_cents >= 0) NOT VALID;
  END IF;
END $$;
ALTER TABLE accounting.lease_contract VALIDATE CONSTRAINT lease_contract_lease_type_check;
ALTER TABLE accounting.lease_contract VALIDATE CONSTRAINT lease_contract_billing_mode_check;
ALTER TABLE accounting.lease_contract VALIDATE CONSTRAINT lease_contract_close_needs_reason;
ALTER TABLE accounting.lease_asset_line VALIDATE CONSTRAINT lease_asset_line_amount_nonneg;

-- Class = unit: a real link from a class to the unit / trailer it tracks (USMCA has no QBO class ids, so the
-- qbo_class_id bridge cannot resolve its units). One class per unit / trailer per entity.
ALTER TABLE catalogs.classes ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES mdata.units(id);
ALTER TABLE catalogs.classes ADD COLUMN IF NOT EXISTS equipment_id uuid REFERENCES mdata.equipment(id);
CREATE UNIQUE INDEX IF NOT EXISTS classes_one_per_unit ON catalogs.classes (operating_company_id, unit_id)
  WHERE unit_id IS NOT NULL AND deactivated_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS classes_one_per_equipment ON catalogs.classes (operating_company_id, equipment_id)
  WHERE equipment_id IS NOT NULL AND deactivated_at IS NULL;

-- One live lease bill per key (per contract-month, or per unit-month), per entity.
CREATE UNIQUE INDEX IF NOT EXISTS bills_one_live_lease_bill_per_key
  ON accounting.bills (operating_company_id, lease_bill_key)
  WHERE lease_bill_key IS NOT NULL AND voided_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS bills_lease_contract ON accounting.bills (lease_contract_id) WHERE lease_contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bill_lines_lease_contract ON accounting.bill_lines (lease_contract_id) WHERE lease_contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bill_lines_unit ON accounting.bill_lines (unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bill_lines_equipment ON accounting.bill_lines (equipment_id) WHERE equipment_id IS NOT NULL;

COMMENT ON COLUMN accounting.lease_contract.lessor_vendor_id IS 'Lessor as a vendor (IH 35 Trucking / IH 35 Transportation vendor record) — the lease bill''s vendor.';
COMMENT ON COLUMN accounting.bills.lease_period_start IS 'Lease month this bill covers (first day). Set only by the lease bill engine.';
COMMENT ON COLUMN accounting.lease_contract.billing_mode IS 'Owner choice at creation: one_bill_per_unit or one_bill_all_units.';
COMMENT ON COLUMN accounting.bill_lines.lease_asset_line_id IS 'Lease asset line (unit or trailer) this bill line charges — reverse: the asset''s bills.';

COMMIT;
