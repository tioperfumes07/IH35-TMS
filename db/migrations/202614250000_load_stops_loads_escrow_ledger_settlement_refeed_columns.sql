-- 202614250000_load_stops_loads_escrow_ledger_settlement_refeed_columns.sql
--
-- Lead ruling (2026-09-22, load/stop schema for the settlement-refeed feeder):
-- createLoadWithFullSideEffects must accept, per stop: sequence · type · facility name ·
-- city · state · zip · scheduled date · LEG MILES; per load: truck · trailer · loaded_miles
-- · empty_miles · driver_pay_rate_per_mile · line-haul miles · MPG. "A stop fed with a city
-- and no consignee is not done." Live-audited against prod (br-fancy-credit-akjnd07a) before
-- writing this: mdata.load_stops has address_line1/city/state/postal_code/country and an
-- OPTIONAL location_id FK to mdata.locations (which itself has location_name), but no
-- free-text name lives on the stop row itself when location_id is unset -- the settlement
-- documents name a consignee that does not always match an existing catalog location, and no
-- per-leg mileage column exists at all. mdata.loads carries aggregate loaded_miles /
-- miles_practical / miles_deadhead / deadhead_miles_to_pickup / driver_pay_rate_per_mile but
-- no per-load MPG anywhere in the schema (only per-vehicle VIEW-computed MPG exists,
-- views.fuel_planner_active_routes.current_mpg / safety.v_fuel_mpg_anomalies.computed_mpg --
-- neither is a stored, settlement-sourced, per-load input).
--
-- E14 (Lead ruling, later same round): driver_finance.driver_settlements also gains
-- is_presettlement -- a pre-settlement must be representable WITHOUT a source_document_ref.
-- Today display_id is NOT NULL and the only identifier available is the AlwaysTrack
-- settlement number, so a genuine pre-settlement (no real document yet) has nowhere honest
-- to record that fact -- the same allocator premature-assigns a document-shaped identifier to
-- rows that do not have one, the root cause named for E9's display_id collisions too.
-- source_document_ref (nullable text) already exists on this table; this migration adds only
-- the boolean flag itself. Schema/migration-authorship only (db/migrations/** is CC-1's lane
-- in every case); the allocator fix and the write path that sets this flag are
-- driver_finance/settlements code -- CC-3's lane -- and are NOT wired by this migration.
-- Flagged to CC-3 via docs/bus/OUTBOX-CC-3.md.
--
-- Additive only, all 4 new columns nullable/defaulted (no backfill invented here -- the
-- feeder and the settlement code populate them going forward).
DO $$
BEGIN
  ----------------------------------------------------------------------------
  -- mdata.load_stops: facility_name (the consignee) + leg_miles (per-leg, not per-load)
  ----------------------------------------------------------------------------
  IF to_regclass('mdata.load_stops') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='mdata' AND table_name='load_stops' AND column_name='facility_name'
    ) THEN
      ALTER TABLE mdata.load_stops ADD COLUMN facility_name text;
      COMMENT ON COLUMN mdata.load_stops.facility_name IS
        'Free-text consignee/facility name as printed on the source document (settlement, rate '
        'con, BOL). Independent of location_id -- location_id is an optional FK into the '
        'mdata.locations catalog and is frequently unset for historical/backfilled stops; this '
        'column is never NULL-because-location_id-was-set, it is the honest record of what the '
        'document actually named.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='mdata' AND table_name='load_stops' AND column_name='leg_miles'
    ) THEN
      ALTER TABLE mdata.load_stops ADD COLUMN leg_miles numeric(10,1);
      COMMENT ON COLUMN mdata.load_stops.leg_miles IS
        'Miles for THIS leg only (prior stop -> this stop), as printed on the source document. '
        'Not the load total -- mdata.loads.miles_practical/loaded_miles/miles_deadhead remain '
        'the per-load aggregates; summing leg_miles across a load''s stops is a derived check, '
        'never assumed equal to the load-level figure without reconciling them.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'load_stops_leg_miles_check'
    ) THEN
      ALTER TABLE mdata.load_stops ADD CONSTRAINT load_stops_leg_miles_check
        CHECK (leg_miles IS NULL OR leg_miles >= 0);
    END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- mdata.loads: empty_miles, line_haul_miles, mpg as SEPARATE fields.
  -- loaded_miles already exists. Deliberately NOT reusing miles_deadhead /
  -- deadhead_miles_to_pickup / miles_practical for these -- those are the existing
  -- routing-engine-sourced figures; empty_miles/line_haul_miles/mpg are the SETTLEMENT'S
  -- own reported figures, which the Lead ruling requires to be carried separately: "Company
  -- line-haul miles and driver loaded miles are DIFFERENT measures. Carry both. Never
  -- average, never pick."
  ----------------------------------------------------------------------------
  IF to_regclass('mdata.loads') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='mdata' AND table_name='loads' AND column_name='empty_miles'
    ) THEN
      ALTER TABLE mdata.loads ADD COLUMN empty_miles numeric(10,1);
      COMMENT ON COLUMN mdata.loads.empty_miles IS
        'Empty/deadhead miles as reported on the settlement document for this load. Distinct '
        'from miles_deadhead/deadhead_miles_to_pickup (routing-engine-sourced) -- this is the '
        'settlement''s own figure, carried separately per Lead ruling 2026-09-22.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='mdata' AND table_name='loads' AND column_name='line_haul_miles'
    ) THEN
      ALTER TABLE mdata.loads ADD COLUMN line_haul_miles numeric(10,1);
      COMMENT ON COLUMN mdata.loads.line_haul_miles IS
        'Company line-haul miles as reported on the settlement document -- a DIFFERENT measure '
        'from loaded_miles (driver-reported). Never averaged or substituted for one another; '
        'both are carried per Lead ruling 2026-09-22.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='mdata' AND table_name='loads' AND column_name='mpg'
    ) THEN
      ALTER TABLE mdata.loads ADD COLUMN mpg numeric(6,2);
      COMMENT ON COLUMN mdata.loads.mpg IS
        'Per-load MPG as reported on the settlement document. Not derived from '
        'views.fuel_planner_active_routes.current_mpg or safety.v_fuel_mpg_anomalies.computed_mpg '
        '-- those are per-vehicle telematics/fuel-purchase VIEWS, not a stored settlement input.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'loads_empty_miles_check'
    ) THEN
      ALTER TABLE mdata.loads ADD CONSTRAINT loads_empty_miles_check
        CHECK (empty_miles IS NULL OR empty_miles >= 0);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'loads_line_haul_miles_check'
    ) THEN
      ALTER TABLE mdata.loads ADD CONSTRAINT loads_line_haul_miles_check
        CHECK (line_haul_miles IS NULL OR line_haul_miles >= 0);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'loads_mpg_check'
    ) THEN
      ALTER TABLE mdata.loads ADD CONSTRAINT loads_mpg_check
        CHECK (mpg IS NULL OR mpg > 0);
    END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- driver_finance.escrow_ledger: direct load_id FK. Schema/migration-authorship only
  -- (db/migrations/** is CC-1's lane in every case); the write path that populates it on
  -- new escrow lines is driver_finance/settlements code -- CC-3's lane -- and is NOT wired
  -- by this migration. Flagged to CC-3 via docs/bus/OUTBOX-CC-3.md.
  ----------------------------------------------------------------------------
  IF to_regclass('driver_finance.escrow_ledger') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='driver_finance' AND table_name='escrow_ledger' AND column_name='load_id'
    ) THEN
      ALTER TABLE driver_finance.escrow_ledger ADD COLUMN load_id uuid;
      COMMENT ON COLUMN driver_finance.escrow_ledger.load_id IS
        'Direct FK to the load that generated this escrow line (e.g. "Load 13471 -- '
        'Driver-Escrow For Claims -25.00"). Deliberately NOT relying solely on '
        'settlement_line_id -> driver_finance.settlement_lines.load_id: that chain requires '
        'settlement_line_id to be populated and non-null on every escrow row, which is not '
        'measured here -- a direct column makes traceability unconditional. Nullable: legacy '
        'rows without a known load stay NULL rather than invent one.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'escrow_ledger_load_id_fkey'
    ) THEN
      ALTER TABLE driver_finance.escrow_ledger
        ADD CONSTRAINT escrow_ledger_load_id_fkey FOREIGN KEY (load_id) REFERENCES mdata.loads(id);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
       WHERE schemaname='driver_finance' AND tablename='escrow_ledger' AND indexname='idx_escrow_ledger_load_id'
    ) THEN
      CREATE INDEX idx_escrow_ledger_load_id ON driver_finance.escrow_ledger(load_id) WHERE load_id IS NOT NULL;
    END IF;
  END IF;

  ----------------------------------------------------------------------------
  -- E14: driver_finance.driver_settlements.is_presettlement -- lets a pre-settlement (no real
  -- source document yet) be represented honestly, instead of inferring it from a premature
  -- display_id/source_document_ref. Default false so every existing row (all of which already
  -- carry a real display_id) is unaffected.
  ----------------------------------------------------------------------------
  IF to_regclass('driver_finance.driver_settlements') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='driver_finance' AND table_name='driver_settlements' AND column_name='is_presettlement'
    ) THEN
      ALTER TABLE driver_finance.driver_settlements ADD COLUMN is_presettlement boolean NOT NULL DEFAULT false;
      COMMENT ON COLUMN driver_finance.driver_settlements.is_presettlement IS
        'True for a genuine pre-settlement created before any real source document (AlwaysTrack '
        'settlement number, etc.) exists for it. E14 (Lead ruling, 2026-09-22): today the only '
        'identifier available is display_id, which is NOT NULL -- so a pre-settlement either goes '
        'without an identifier at all or gets a premature one. This flag lets the allocator (and '
        'every downstream reader) tell the two cases apart honestly. Root-cause note: this is the '
        'SAME allocator implicated in E9''s display_id collisions -- one root cause, two symptoms, '
        'named together per the Lead''s ruling, not fixed here (schema-only migration).';
    END IF;
  END IF;
END $$;
