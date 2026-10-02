-- 202615210100_lease_to_own_buyout_close.sql
-- HELD — DO NOT RUN ON PROD until the Lead validates it on a Neon branch and applies it (CC-1 could not validate:
-- Neon write MCP 401 and local Postgres denied on 2026-10-02). Registered in db/migrations/.held-migrations.json
-- (verify:hold-migrations-registered). Fresh / CI databases apply it normally.
--
-- ROUND 321 (CC-1) — lease-to-own BUYOUT close (ASC 842 lessee). At buyout the lessee pays the purchase price (a bill to
-- the lessor vendor that settles the remaining lease liability), reclassifies the right-of-use asset into an owned fixed
-- asset, takes title (unit / trailer owner -> lessee) and registers the asset in accounting.fixed_assets.
--   * lease_contract.bought_out_at / buyout_bill_id / buyout_je_id: the close and its documents (lease <-> bill <-> JE).
--   * fixed_assets.equipment_id: a bought-out TRAILER lands in the register like a unit does (unit_uuid already exists).
-- Additive, idempotent.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE accounting.lease_contract ADD COLUMN IF NOT EXISTS bought_out_at timestamptz;
ALTER TABLE accounting.lease_contract ADD COLUMN IF NOT EXISTS buyout_bill_id uuid REFERENCES accounting.bills(id);
ALTER TABLE accounting.lease_contract ADD COLUMN IF NOT EXISTS buyout_je_id uuid REFERENCES accounting.journal_entries(id);
ALTER TABLE accounting.fixed_assets ADD COLUMN IF NOT EXISTS equipment_id uuid REFERENCES mdata.equipment(id);
CREATE INDEX IF NOT EXISTS fixed_assets_equipment_idx ON accounting.fixed_assets (operating_company_id, equipment_id) WHERE equipment_id IS NOT NULL;
COMMENT ON COLUMN accounting.lease_contract.bought_out_at IS 'ROUND 321: lease-to-own buyout close (title to the lessee).';
COMMENT ON COLUMN accounting.fixed_assets.equipment_id IS 'ROUND 321: the trailer this fixed asset is (unit_uuid is the truck).';
COMMIT;
