-- [HOLD-FOR-JORGE — TIER 1] DO NOT RUN ON PROD — run ONLY on a Neon branch by Jorge's hand, then
-- ledger-backfill so prod db:migrate skips it. Registered in db/migrations/.held-migrations.json.
-- P3-INVOICE-FK cluster / item 18 — real vendor FK on bills -> canonical mdata.vendors.
-- GUARD-verified vs live prod (2026-07-11): accounting.bills references vendors via TWO soft TEXT keys
-- (vendor_id text, vendor_uuid text), NEITHER an FK to the canonical AP truth mdata.vendors — a 1099/AP
-- integrity risk (a typo/cross-entity/QBO-mirror id is not caught). This ADDS a real uuid vendor key,
-- mdata_vendor_id uuid FK -> mdata.vendors(id) (nullable → FK holds trivially while unpopulated) + an
-- index. NO backfill and NO NOT-NULL here: GUARD backfills from the existing text keys + proves coverage,
-- and writers are repointed to stop populating the QBO-mirror id as the AP vendor, in a follow-up (see the
-- block's deferred[]). Additive-only, idempotent, FORCED RLS + grants unchanged. Tier-1 — build-and-hold.

BEGIN;

ALTER TABLE accounting.bills
  ADD COLUMN IF NOT EXISTS mdata_vendor_id uuid REFERENCES mdata.vendors(id);

CREATE INDEX IF NOT EXISTS idx_bills_mdata_vendor
  ON accounting.bills (mdata_vendor_id)
  WHERE mdata_vendor_id IS NOT NULL;

COMMIT;
