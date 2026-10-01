-- 202615190100_legal_contract_and_matter_linkage.sql
-- ROUND 316 CC-1 — LEGAL LINKAGE (§10-B). Measured 2026-10-01: legal.contract_instances names its signer only by a
-- polymorphic signer_entity_id (no FK); contract_instance_links.link_type lacks vendor / load / invoice / bill /
-- equipment / lease_contract; legal.matters has no customer / vendor / load link and its financial_reserve_cents is
-- never posted. Additive real FKs + extended link types + a reserve JE link. Idempotent; lock_timeout.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE legal.contract_instances ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES mdata.customers(id);
ALTER TABLE legal.contract_instances ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES mdata.vendors(id);
ALTER TABLE legal.contract_instances ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES mdata.drivers(id);
ALTER TABLE legal.contract_instances ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES mdata.units(id);
ALTER TABLE legal.contract_instances ADD COLUMN IF NOT EXISTS equipment_id uuid REFERENCES mdata.equipment(id);
ALTER TABLE legal.contract_instances ADD COLUMN IF NOT EXISTS load_id uuid REFERENCES mdata.loads(id);
ALTER TABLE legal.contract_instances ADD COLUMN IF NOT EXISTS lease_contract_id uuid REFERENCES accounting.lease_contract(id);
ALTER TABLE legal.contract_instances ADD COLUMN IF NOT EXISTS counterparty_company_id uuid REFERENCES org.companies(id);

-- signer_type gains 'company' (an entity signing, e.g. USMCA as lessee).
ALTER TABLE legal.contract_instances DROP CONSTRAINT IF EXISTS contract_instances_signer_type_check;
ALTER TABLE legal.contract_instances ADD CONSTRAINT contract_instances_signer_type_check
  CHECK (signer_type = ANY (ARRAY['driver','employee','customer','vendor','company','other']::text[])) NOT VALID;
ALTER TABLE legal.contract_instances VALIDATE CONSTRAINT contract_instances_signer_type_check;

ALTER TABLE legal.contract_instance_links DROP CONSTRAINT IF EXISTS contract_instance_links_link_type_check;
ALTER TABLE legal.contract_instance_links ADD CONSTRAINT contract_instance_links_link_type_check
  CHECK (link_type = ANY (ARRAY['driver','employee','customer','unit','matter','deduction_schedule','fixed_asset','dq_file',
                                'vendor','load','invoice','bill','equipment','lease_contract','company']::text[])) NOT VALID;
ALTER TABLE legal.contract_instance_links VALIDATE CONSTRAINT contract_instance_links_link_type_check;

ALTER TABLE legal.matters ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES mdata.customers(id);
ALTER TABLE legal.matters ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES mdata.vendors(id);
ALTER TABLE legal.matters ADD COLUMN IF NOT EXISTS load_id uuid REFERENCES mdata.loads(id);
ALTER TABLE legal.matters ADD COLUMN IF NOT EXISTS reserve_journal_entry_id uuid REFERENCES accounting.journal_entries(id);
ALTER TABLE legal.matters ADD COLUMN IF NOT EXISTS reserve_posted_cents bigint;
ALTER TABLE legal.matters ADD COLUMN IF NOT EXISTS reserve_posted_at timestamptz;

CREATE INDEX IF NOT EXISTS contract_instances_customer ON legal.contract_instances (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contract_instances_vendor ON legal.contract_instances (vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contract_instances_driver ON legal.contract_instances (driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contract_instances_unit ON legal.contract_instances (unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contract_instances_lease ON legal.contract_instances (lease_contract_id) WHERE lease_contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS matters_customer ON legal.matters (customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS matters_vendor ON legal.matters (vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS matters_load ON legal.matters (load_id) WHERE load_id IS NOT NULL;

COMMIT;
