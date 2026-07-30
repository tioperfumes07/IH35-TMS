-- LEASE-01 — Trucking leases the SAME unit to BOTH Transportation and USMCA, and the schema could not
-- say so. This is the structural fix I twice recorded as "needs design" instead of building.
--
-- OWNER RULING, stated more than once and unambiguous:
--   2026-07-29: "all units are leased at the same time, simultaneously to both trucking and
--                transportaiton. trucking is the only owner of the equipment."
--   2026-07-30: "trucking owns the equipment and leases the same equipment to both transprotation and
--                to usmca."
--
-- WHY THE DATA COULD NOT SAY IT. mdata.units.currently_leased_to_company_id and
-- mdata.equipment.currently_leased_to_company_id are SINGLE uuid columns. One column holds one lessee.
-- So the ruling was unrepresentable, and prod today shows exactly that shortfall — verified on
-- br-fancy-credit-akjnd07a with bypass_rls in its OWN statement (complete reads: units 186 == 186,
-- equipment 182 == 182):
--     mdata.units      TRK owns 186 · 50 active leased to TRANSP · USMCA leases: 0
--     mdata.equipment  TRK owns 182 · 81 active leased to TRANSP · USMCA leases: 0
-- Ownership is already correct (LST-F24/F24b/F27 landed). The missing half is the second lessee.
--
-- WHY A COLUMN CANNOT BE PATCHED INTO SHAPE. Adding a second column (…_leased_to_company_id_2) would
-- cap the model at two lessees, encode lessee identity in a column NAME, and leave every existing
-- reader silently reading only the first one. A lease is a RELATIONSHIP with its own lifecycle —
-- commencement, end, termination — which is what ASC 842 accounts for and what NetSuite/McLeod model as
-- a lease record rather than a field on the asset. So: a real table, one row per (asset, lessee).
--
-- ADDITIVE-ONLY. The existing currently_leased_to_company_id columns are NOT dropped, NOT renamed and
-- NOT stop-written. Every current reader keeps working unchanged; this table is added alongside as the
-- canonical multi-lessee record. Repointing readers is a separate, reviewable step — doing it here
-- would turn a schema addition into a behaviour change nobody asked for.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT INVENT: commencement dates, end dates, rates, or payment
-- terms. The owner asserted WHO leases WHAT; he did not state WHEN or FOR HOW MUCH, and a lease date is
-- a legal fact that appears on an ASC 842 schedule. commenced_on is therefore NULLABLE and left NULL
-- where unknown, rather than fabricating a date that would later be read as authoritative by a CPA, a
-- lender, or a court. Rates are not modelled here at all.

CREATE TABLE IF NOT EXISTS mdata.asset_leases (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RLS scope = the LESSEE, the entity that operates the asset and carries the rent expense.
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  lessor_company_id     uuid NOT NULL REFERENCES org.companies(id),
  lessee_company_id     uuid NOT NULL REFERENCES org.companies(id),
  -- Exactly one asset side. Two typed FKs rather than an untyped asset_id, so the database keeps
  -- referential integrity instead of the application promising it.
  unit_id               uuid REFERENCES mdata.units(id),
  equipment_id          uuid REFERENCES mdata.equipment(id),
  commenced_on          date,
  ended_on              date,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- identity.users is a §10 HUB: an unresolvable id cannot answer "who agreed this lease".
  created_by_user_id    uuid REFERENCES identity.users(id),
  updated_by_user_id    uuid REFERENCES identity.users(id),
  deactivated_at        timestamptz,
  CONSTRAINT ck_asset_leases_exactly_one_asset
    CHECK ((unit_id IS NOT NULL) <> (equipment_id IS NOT NULL)),
  -- An entity cannot lease from itself; that is the self-lease defect BANK-F14 found in banking.
  CONSTRAINT ck_asset_leases_no_self_lease CHECK (lessor_company_id <> lessee_company_id),
  -- The RLS scope must BE the lessee, or a row could be scoped to an entity that is not party to it.
  CONSTRAINT ck_asset_leases_scope_is_lessee CHECK (operating_company_id = lessee_company_id),
  -- Deactivated implies inactive — the BANK-F14 lesson: two flags for one idea drift, so make the
  -- contradictory state unrepresentable rather than relying on every query to check both.
  CONSTRAINT ck_asset_leases_deactivated_implies_inactive
    CHECK (deactivated_at IS NULL OR is_active = false)
);

-- One ACTIVE lease per (asset, lessee). Partial, so history is never constrained: the same unit may be
-- re-leased to the same lessee after an earlier lease ends.
CREATE UNIQUE INDEX IF NOT EXISTS ux_asset_leases_active_unit_lessee
  ON mdata.asset_leases (unit_id, lessee_company_id)
  WHERE is_active AND deactivated_at IS NULL AND unit_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_asset_leases_active_equipment_lessee
  ON mdata.asset_leases (equipment_id, lessee_company_id)
  WHERE is_active AND deactivated_at IS NULL AND equipment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_asset_leases_unit ON mdata.asset_leases (operating_company_id, unit_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_asset_leases_equipment ON mdata.asset_leases (operating_company_id, equipment_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_asset_leases_lessor ON mdata.asset_leases (lessor_company_id) WHERE is_active;

ALTER TABLE mdata.asset_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.asset_leases FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS asset_leases_tenant_scope ON mdata.asset_leases;
  -- Bilateral by design: a lease is an agreement between two entities, so BOTH parties can see it.
  -- Lessee via operating_company_id (the standard scope), lessor via lessor_company_id — otherwise
  -- Trucking, which owns every asset, could not see a single one of its own leases.
  CREATE POLICY asset_leases_tenant_scope ON mdata.asset_leases
    FOR ALL TO ih35_app
    USING (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true)
           OR lessor_company_id::text = current_setting('app.operating_company_id', true))
    WITH CHECK (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true));
  -- 0065 grant pattern. No DELETE: leases are retired via is_active/deactivated_at, never removed —
  -- a deleted lease is a deleted legal record.
  GRANT SELECT, INSERT, UPDATE ON mdata.asset_leases TO ih35_app;
END
$$;

DO $$
DECLARE
  v_trk uuid;
  v_transp uuid;
  v_usmca uuid;
  v_units_backfilled int;
  v_equip_backfilled int;
  v_units_usmca int;
  v_equip_usmca int;
  v_self int;
  v_scope int;
BEGIN
  SELECT id INTO v_trk    FROM org.companies WHERE code = 'TRK';
  SELECT id INTO v_transp FROM org.companies WHERE code = 'TRANSP';
  SELECT id INTO v_usmca  FROM org.companies WHERE code = 'USMCA';

  IF v_trk IS NULL OR v_transp IS NULL OR v_usmca IS NULL THEN
    RAISE NOTICE 'LEASE-01: TRK/TRANSP/USMCA not all present — table created, no rows seeded.';
    RETURN;
  END IF;

  -- 1. BACKFILL the leases that already exist, from the single column. This is a faithful copy of
  --    current truth, not an assertion: every row here mirrors a currently_leased_to_company_id that
  --    prod already holds. commenced_on stays NULL because the column never recorded a date.
  INSERT INTO mdata.asset_leases (operating_company_id, lessor_company_id, lessee_company_id, unit_id)
  SELECT u.currently_leased_to_company_id, u.owner_company_id, u.currently_leased_to_company_id, u.id
    FROM mdata.units u
   WHERE u.currently_leased_to_company_id IS NOT NULL
     AND u.owner_company_id IS NOT NULL
     AND u.owner_company_id <> u.currently_leased_to_company_id
     AND u.deactivated_at IS NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_units_backfilled = ROW_COUNT;

  INSERT INTO mdata.asset_leases (operating_company_id, lessor_company_id, lessee_company_id, equipment_id)
  SELECT e.currently_leased_to_company_id, e.owner_company_id, e.currently_leased_to_company_id, e.id
    FROM mdata.equipment e
   WHERE e.currently_leased_to_company_id IS NOT NULL
     AND e.owner_company_id IS NOT NULL
     AND e.owner_company_id <> e.currently_leased_to_company_id
     AND e.deactivated_at IS NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_equip_backfilled = ROW_COUNT;

  -- 2. THE SECOND LESSEE — the half the single column could never hold. Owner ruling: the SAME units
  --    Trucking owns are leased to USMCA as well as Transportation. Scoped to assets that are TRK-owned
  --    and live; nothing sold, deactivated or superseded gets a lease (the LST-F24b lesson).
  INSERT INTO mdata.asset_leases (operating_company_id, lessor_company_id, lessee_company_id, unit_id)
  SELECT v_usmca, v_trk, v_usmca, u.id
    FROM mdata.units u
   WHERE u.owner_company_id = v_trk
     AND u.deactivated_at IS NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_units_usmca = ROW_COUNT;

  INSERT INTO mdata.asset_leases (operating_company_id, lessor_company_id, lessee_company_id, equipment_id)
  SELECT v_usmca, v_trk, v_usmca, e.id
    FROM mdata.equipment e
   WHERE e.owner_company_id = v_trk
     AND e.deactivated_at IS NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_equip_usmca = ROW_COUNT;

  -- Fail closed: re-derive rather than trust the inserts above.
  SELECT count(*) INTO v_self  FROM mdata.asset_leases WHERE lessor_company_id = lessee_company_id;
  SELECT count(*) INTO v_scope FROM mdata.asset_leases WHERE operating_company_id <> lessee_company_id;

  RAISE NOTICE 'LEASE-01: backfilled % unit + % equipment lease(s); added % unit + % equipment USMCA lease(s)',
    v_units_backfilled, v_equip_backfilled, v_units_usmca, v_equip_usmca;

  IF v_self <> 0 THEN
    RAISE EXCEPTION 'LEASE-01: % self-lease row(s) — an entity cannot lease from itself. Aborting.', v_self;
  END IF;
  IF v_scope <> 0 THEN
    RAISE EXCEPTION 'LEASE-01: % row(s) scoped to a non-lessee entity. Aborting.', v_scope;
  END IF;
END $$;

COMMENT ON TABLE mdata.asset_leases IS
  'LEASE-01 (2026-07-30): canonical multi-lessee equipment leases. Trucking owns every unit and leases the SAME asset to BOTH Transportation and USMCA (owner ruling 2026-07-29 and 2026-07-30) — a relationship mdata.units.currently_leased_to_company_id could not express, being a single uuid column. Additive: that column is retained and still written; this table is the canonical record and the ASC 842 foundation. commenced_on/ended_on are NULL where unknown rather than fabricated; rates are not modelled here.';
