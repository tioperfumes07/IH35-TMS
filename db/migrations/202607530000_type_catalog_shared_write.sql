-- [HOLD-FOR-JORGE] insurance.type_catalog — shared read + WRITE for the app.
-- DO NOT RUN ON PROD via db:migrate. Already applied on the prod Neon branch (2026-07-15) + ledger-backfilled;
-- committed now to close repo drift (was applied but never committed). CI fresh-from-0001 applies it so
-- schema-parity matches prod; the prod ledger's original checksum reconciles via scripts/lib/migration-checksum-overrides.json.
--
-- type_catalog is shared reference data (all entities read all types). Owner directive 2026-07-15: the app must
-- also be able to WRITE it (add/edit insurance types). Replaces the SELECT-only shared_read policy with a
-- FOR ALL shared policy. Idempotent (DROP IF EXISTS + CREATE). No schema change.
BEGIN;
ALTER TABLE insurance.type_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS insurance_type_catalog_shared_read ON insurance.type_catalog;
DROP POLICY IF EXISTS insurance_type_catalog_shared_rw ON insurance.type_catalog;
CREATE POLICY insurance_type_catalog_shared_rw ON insurance.type_catalog
  FOR ALL TO ih35_app
  USING (true) WITH CHECK (true);
COMMIT;
