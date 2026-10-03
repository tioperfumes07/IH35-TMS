-- 202614430000_fuel_transactions_genesis_anchor_gross_cost_discount_fee.sql
-- ============================================================================================================
-- RECONSTRUCTED FROM PRODUCTION 2026-10-03 (CC-1, ROUND 372.2 — docs/bus/10-03-2026-CC-1-ROUND-372-FOUR-RULINGS-AND-THE-MULTI-LOAD-SETTLEMENT-LINE.md)
--   Applied to production: 2026-09-28 05:27:05.600516+00, applied_by neondb_owner, 427 ms
--   (_system._schema_migrations).
--   The original source of this migration was NEVER COMMITTED and could not be found in any checkout, branch or
--   temp directory on this machine (every file whose name matches was sha256-checked against the ledger checksum).
--   This file is written from production's live catalog, read on the direct endpoint 2026-10-03, and produces exactly
--   that live state; on production it is never re-run (the ledger checksum differs and is recorded in
--   scripts/lib/migration-checksum-overrides.json, citing the ruling above).
--   Objects covered: fuel.fuel_transactions.gross_cost (numeric NULL), .discount_amount (numeric NOT NULL DEFAULT 0),
--   .fee_amount (numeric NOT NULL DEFAULT 0), and their column comments, all as live. The same three columns are
--   documented by 202614550000_fuel_transactions_genesis_anchor_gross_cost_discount_fee_documented.sql; 202614420000
--   and 202614430000 were both stamped on production (05:17Z and 05:27Z) for the same change.
--   Intent was reconstructed from effects. It is listed under "what we cannot prove" in the blueprint (ROUND 366.4).
-- ============================================================================================================
BEGIN;
ALTER TABLE fuel.fuel_transactions ADD COLUMN IF NOT EXISTS gross_cost numeric;
ALTER TABLE fuel.fuel_transactions ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE fuel.fuel_transactions ADD COLUMN IF NOT EXISTS fee_amount numeric NOT NULL DEFAULT 0;
COMMENT ON COLUMN fuel.fuel_transactions.gross_cost IS 'Genesis-anchored 2026-09-28 (this migration) -- column already existed live with no prior migration. Pre-discount/fee gross receipt amount; NULL where not captured.';
COMMENT ON COLUMN fuel.fuel_transactions.discount_amount IS 'Genesis-anchored 2026-09-28 (this migration) -- column already existed live with no prior migration. Card-network or vendor discount applied to gross_cost; 0 where none.';
COMMENT ON COLUMN fuel.fuel_transactions.fee_amount IS 'Genesis-anchored 2026-09-28 (this migration) -- column already existed live with no prior migration. Card or transaction fee added on top of gross_cost; 0 where none.';
COMMIT;
