-- [HOLD-FOR-JORGE — TIER 1] DO NOT RUN ON PROD — run ONLY on a Neon branch by Jorge's hand, then
-- ledger-backfill so prod db:migrate skips it. Registered in db/migrations/.held-migrations.json
-- (verify-held-registry-ledger-parity.mjs enforces the parity).
--
-- C9 BOOK-LOAD FIELD ROUND-TRIP — the remaining fields the Book Load wizard renders but mdata.loads
-- has nowhere to put. Verified against prod (Neon br-fancy-credit-akjnd07a, information_schema) that
-- none of the eight columns below exist on mdata.loads today.
--
--   requires_reefer_fuel / requires_pulp_probe / requires_locking_jacks / requires_load_locks /
--   requires_straps — five of the six equipment-requirement chips in BookLoadEquipmentSection.
--   requires_tarps is the only one of the six with a column today (this migration does not touch it).
--
--   load_type — the Broker/Direct toggle rendered in §A. Distinct from mdata.customers' own
--   broker/direct fact (there is none there either as of this migration — the booking screen's
--   choice is a per-load fact, not a customer default, and previously had nowhere to land).
--
--   driver_pay_rate_per_mile — the driver's real 1099 per-mile pay term entered at booking. This is
--   money the driver is owed, not a UI-only estimate, so it gets a real column rather than staying
--   an inert "estimate only" input.
--
--   factoring_company_vendor_id — the factoring company selected for THIS load (a load-level fact
--   distinct from mdata.customers.factoring_company_vendor_id added by migration 0022, which is the
--   customer's default factor). Same FK target (mdata.vendors(id)) and same nullable-override shape.
--
-- Additive only. No backfill (all NULL/false on existing rows — honest: no data existed to backfill).
-- No RLS change (mdata.loads' existing entity-scoped FORCED RLS + grants already cover new columns —
-- migration 0065's default-privilege grant pattern, verified against mdata.loads's existing policies).
-- No DROP, no DELETE, no UPDATE of existing rows. Idempotent (IF NOT EXISTS everywhere); safe to
-- re-run. No GL math, no posting, no QBO write-back — this only persists booking-screen facts.

BEGIN;

ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS requires_reefer_fuel boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_pulp_probe boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_locking_jacks boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_load_locks boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_straps boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS load_type text,
  ADD COLUMN IF NOT EXISTS driver_pay_rate_per_mile numeric(12,4),
  ADD COLUMN IF NOT EXISTS factoring_company_vendor_id uuid;

-- CHECK + FK added in a guarded DO block (not inline) so re-running the migration never tries to
-- add a constraint that already exists — ALTER TABLE ... ADD CONSTRAINT has no IF NOT EXISTS.
DO $c9_book_load_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'mdata.loads'::regclass
      AND conname = 'loads_load_type_check'
  ) THEN
    ALTER TABLE mdata.loads
      ADD CONSTRAINT loads_load_type_check
      CHECK (load_type IS NULL OR load_type IN ('broker', 'direct'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'mdata.loads'::regclass
      AND conname = 'loads_factoring_company_vendor_id_fkey'
  ) THEN
    ALTER TABLE mdata.loads
      ADD CONSTRAINT loads_factoring_company_vendor_id_fkey
      FOREIGN KEY (factoring_company_vendor_id) REFERENCES mdata.vendors(id)
      ON DELETE SET NULL;
  END IF;
END
$c9_book_load_constraints$;

CREATE INDEX IF NOT EXISTS idx_loads_factoring_company_vendor_id
  ON mdata.loads (factoring_company_vendor_id)
  WHERE factoring_company_vendor_id IS NOT NULL;

COMMENT ON COLUMN mdata.loads.requires_reefer_fuel IS
  'Equipment requirement chip (BookLoadEquipmentSection): the trailer needs reefer fuel topped off. Additive C9 round-trip column.';
COMMENT ON COLUMN mdata.loads.requires_pulp_probe IS
  'Equipment requirement chip: a pulp/temp probe is required at pickup/delivery for produce loads. Additive C9 round-trip column.';
COMMENT ON COLUMN mdata.loads.requires_locking_jacks IS
  'Equipment requirement chip: locking landing-gear jacks required (theft-sensitive freight). Additive C9 round-trip column.';
COMMENT ON COLUMN mdata.loads.requires_load_locks IS
  'Equipment requirement chip: load locks / e-track bars required to secure the freight. Additive C9 round-trip column.';
COMMENT ON COLUMN mdata.loads.requires_straps IS
  'Equipment requirement chip: straps required (flatbed/open-deck securement beyond tarps). Additive C9 round-trip column.';
COMMENT ON COLUMN mdata.loads.load_type IS
  'Broker vs Direct at the LOAD level, chosen on the Book Load wizard §A. NULL = not set. Distinct from any future customer-level broker/direct default.';
COMMENT ON COLUMN mdata.loads.driver_pay_rate_per_mile IS
  'Driver''s per-mile pay rate agreed at booking (1099 contractor pay term, not a settlement-computed value). NULL = not entered. Feeds the settlement engine''s pay estimate; does not itself post money.';
COMMENT ON COLUMN mdata.loads.factoring_company_vendor_id IS
  'Factoring company for THIS load (mdata.vendors, vendor_type typically factoring-related). NULL = use the customer''s default factor (mdata.customers.factoring_company_vendor_id, migration 0022) or the operating-company default. Per-load override only — does not change the customer record.';

COMMIT;
