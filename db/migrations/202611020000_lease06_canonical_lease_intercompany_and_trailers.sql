-- LEASE-06 — two ADDITIVE columns on the CANONICAL lease model, replacing the parallel model I built.
--
-- WHAT HAPPENED, recorded plainly because it is the reason this migration is small.
-- I built mdata.asset_leases + mdata.lease_contracts/_groups/_units for dual-lessee leasing. GUARD
-- caught that accounting.lease_contract + accounting.lease_asset_line ALREADY EXIST and model the same
-- thing — and model it BETTER: `election` (the ASC 842 election I duplicated as
-- asc842_classification), `commencement_je_id` (the GL posting hook I called "a further block"),
-- discount_rate_bps, residual_value_cents, total_lease_payments_cents, number_of_periods,
-- payment_frequency, and lease_asset_line.fixed_asset_id -> accounting.fixed_assets, which ties the
-- lease to the depreciating asset — the entire point of the Option A operating-lease election.
--
-- My "what already existed" check missed them because I grepped legal.*, lease_to_own, and
-- *monthly*/lease_*cents. The real table is accounting.lease_contract (singular) with
-- payment_amount_cents — outside every pattern I searched. I then wrote "no per-unit monthly lease
-- amount exists anywhere" as a verified statement. It was a verified statement about MY SEARCH, not
-- about the database. Shipping the parallel model would have been the qbo_vendors split-brain class.
--
-- C2 / LINKAGE-LAW DECLARATION — REQUIRED, and this is it:
--   CANONICAL:  accounting.lease_contract + accounting.lease_asset_line.
--   RETIRED:    mdata.asset_leases, mdata.lease_contracts, mdata.lease_contract_groups,
--               mdata.lease_contract_units — NEVER SHIPPED. They exist only on the unmerged branch and
--               on a disposable rehearsal branch; to_regclass('mdata.asset_leases') is NULL on prod,
--               verified. Nothing to retire in the database, nothing to repoint, no data to migrate.
--               There is no second lease structure and there never was one in production.
--   This migration EXTENDS the canonical tables. It creates no new lease table.
--
-- DUAL LESSEE IS TWO CONTRACTS, and the schema proves it rather than my asserting it:
-- lease_contract.commencement_date is a single NOT NULL column under
-- CHECK (end_date >= commencement_date), with ONE commencement_je_id per contract. TRANSP commences
-- 2022-01-01 and USMCA 2026-08-07 — two dates, two obligations, two postings. One row cannot hold
-- both. So "the same unit leased to both entities" is two contracts over the same asset set, which is
-- the correct GAAP representation, not a workaround. mdata.asset_leases is therefore unnecessary.
--
-- ── GAP 1 — TRAILERS CANNOT GO ON A LEASE LINE ────────────────────────────────────────────────────
-- accounting.lease_asset_line links unit_uuid -> mdata.units and fixed_asset_id ->
-- accounting.fixed_assets. Trailers live in mdata.equipment, so today a lease line CANNOT reference a
-- trailer at all. The owner leases flatbeds and reefers; without this, every trailer silently drops off
-- the contract.
--
-- ── GAP 2 — THE LESSEE CANNOT BE AN OPERATING COMPANY ─────────────────────────────────────────────
-- The model is asymmetric: lessor_operating_company_id is NOT NULL -> org.companies, but the lessee is
-- lessee_customer_id -> mdata.customers plus a NOT NULL free-text lessee_name. TRANSP and USMCA are
-- ENTITIES, not customers. So an intercompany lease could only be recorded by typing the entity's name
-- into text and leaving lessee_customer_id NULL: no FK, no entity scoping, and no way to answer "what
-- does USMCA lease" — the FK-island class LST-LINK-02 exists to catch. Adopting the canonical model
-- without this would have traded one gap for another.
--
-- Both new columns are NULLABLE and additive. No row is inserted, updated or deleted; nothing is
-- dropped or renamed. lessee_name stays NOT NULL and untouched — it remains the human label.
--
-- ONE EXISTING COLUMN IS RELAXED, and it is called out here rather than buried: this migration runs
-- ALTER accounting.lease_asset_line ALTER COLUMN fixed_asset_id DROP NOT NULL. That is a widening, so
-- no existing row can violate it and no existing reader can break — but it IS a change to a financial
-- table's shape, not a pure addition, and the header said otherwise before GUARD caught it. Rationale
-- at the statement. Both CHECKs below are enforced as EXACTLY-ONE via num_nonnulls()/counted
-- predicates; an at-most-one CHECK is TRUE when everything is NULL and would have left the very hole
-- this migration exists to close.

ALTER TABLE accounting.lease_asset_line
  ADD COLUMN IF NOT EXISTS equipment_id uuid REFERENCES mdata.equipment(id);

ALTER TABLE accounting.lease_contract
  ADD COLUMN IF NOT EXISTS lessee_operating_company_id uuid REFERENCES org.companies(id);

CREATE INDEX IF NOT EXISTS idx_lease_asset_line_equipment
  ON accounting.lease_asset_line (operating_company_id, equipment_id) WHERE equipment_id IS NOT NULL;

-- The table already guarantees UNIQUE (lease_contract_id, fixed_asset_id) WHERE is_active — one line per
-- asset per contract. That index keys on fixed_asset_id ONLY, so adding equipment_id without a matching
-- guarantee would let the SAME trailer be attached to one contract TWICE under two different fixed_asset
-- rows: the contract total would then be split across a phantom extra line and every per-trailer monthly
-- amount would come out wrong. Found by running the negative arms, not by reading the DDL. Mirror it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lease_asset_line_contract_equipment
  ON accounting.lease_asset_line (lease_contract_id, equipment_id)
  WHERE equipment_id IS NOT NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_lease_contract_lessee_opco
  ON accounting.lease_contract (lessee_operating_company_id) WHERE lessee_operating_company_id IS NOT NULL;

DO $$
DECLARE
  v_bad_lines int;
  v_bad_lessee int;
BEGIN
  -- ── THE TRAILER COLUMN WAS DEAD AS FIRST WRITTEN. fixed_asset_id is NOT NULL and
  -- accounting.fixed_assets is unit-keyed: on prod it holds 1 row and 0 of the 81 trailers have one.
  -- So adding equipment_id alone left a real trailer line UNWRITEABLE — the column would have shipped
  -- as decoration. My first pass "proved" the trailer path by SEEDING a fixed_asset row, which is the
  -- same vacuous-arm shape that let 202610260000 pass CI and then block prod for 5.5h: the arm passed
  -- because the fixture supplied something production does not have. A real trailer has no fixed_asset,
  -- so the honest arm inserts a trailer line with fixed_asset_id NULL.
  --
  -- fixed_asset_id becomes NULLABLE. It stays the link to the capitalized, depreciating asset whenever
  -- one exists (unchanged for every truck line, and required by nothing here to disappear); it simply
  -- stops being the ONLY way to identify the leased thing. Capitalizing the 368 assets is accountant
  -- work and owner-entered; the operational lease must be recordable without inventing those rows.
  ALTER TABLE accounting.lease_asset_line ALTER COLUMN fixed_asset_id DROP NOT NULL;

  -- EXACTLY ONE asset identity per line — a unit side (fixed_asset_id and/or unit_uuid) or a trailer
  -- (equipment_id), never both and never NEITHER. "Neither" is the case that matters: a line naming no
  -- asset at all would silently take a share of the contract total and distort every per-unit amount.
  SELECT count(*) INTO v_bad_lines
    FROM accounting.lease_asset_line
   WHERE ((fixed_asset_id IS NOT NULL OR unit_uuid IS NOT NULL))::int + (equipment_id IS NOT NULL)::int <> 1;
  IF v_bad_lines <> 0 THEN
    RAISE EXCEPTION 'LEASE-06: % lease line(s) do not name exactly one asset identity. Aborting.', v_bad_lines;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_lease_asset_line_one_asset_kind') THEN
    ALTER TABLE accounting.lease_asset_line
      ADD CONSTRAINT ck_lease_asset_line_one_asset_kind
      CHECK (((fixed_asset_id IS NOT NULL OR unit_uuid IS NOT NULL))::int
             + (equipment_id IS NOT NULL)::int = 1);
  END IF;

  -- ── THE LESSEE CHECK SAID "EXACTLY ONE" AND ENFORCED "AT MOST ONE".
  -- CHECK (NOT (A IS NOT NULL AND B IS NOT NULL)) is TRUE when BOTH are NULL, so it still permitted a
  -- contract whose only lessee identity is the free-text lessee_name — precisely the gap this migration
  -- exists to close. The comment claimed exactly-one and the SQL did not implement it; the surrounding
  -- prose even rationalised the weaker form. num_nonnulls() is the correct primitive.
  SELECT count(*) INTO v_bad_lessee
    FROM accounting.lease_contract
   WHERE num_nonnulls(lessee_operating_company_id, lessee_customer_id) <> 1;
  IF v_bad_lessee <> 0 THEN
    RAISE EXCEPTION 'LEASE-06: % contract(s) do not name exactly one lessee. Aborting.', v_bad_lessee;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_lease_contract_lessee_exactly_one') THEN
    ALTER TABLE accounting.lease_contract
      ADD CONSTRAINT ck_lease_contract_lessee_exactly_one
      CHECK (num_nonnulls(lessee_operating_company_id, lessee_customer_id) = 1);
  END IF;

  -- An intercompany lease may not name its own lessor as lessee. This is the same self-lease defect
  -- BANK-F14 found in banking, made unrepresentable here before any lease row exists.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_lease_contract_no_self_lease') THEN
    ALTER TABLE accounting.lease_contract
      ADD CONSTRAINT ck_lease_contract_no_self_lease
      CHECK (lessee_operating_company_id IS NULL
             OR lessee_operating_company_id <> lessor_operating_company_id);
  END IF;

  RAISE NOTICE 'LEASE-06: canonical lease model extended — trailers on lines, intercompany lessee, self-lease blocked.';
END $$;

COMMENT ON COLUMN accounting.lease_asset_line.equipment_id IS
  'LEASE-06 (2026-07-30): trailers. unit_uuid covers mdata.units (tractors) only, so a lease line could not reference a trailer at all — every flatbed and reefer silently dropped off a contract. EXACTLY ONE asset identity per line — a unit side (fixed_asset_id and/or unit_uuid) or a trailer (equipment_id), never both and never neither (ck_lease_asset_line_one_asset_kind). fixed_asset_id was made NULLABLE here: it is unit-keyed and 0 of 81 trailers have one on prod, so leaving it NOT NULL made this column unwriteable for any real trailer.';

COMMENT ON COLUMN accounting.lease_contract.lessee_operating_company_id IS
  'LEASE-06 (2026-07-30): intercompany lessee. lessor_operating_company_id was NOT NULL -> org.companies while the lessee was lessee_customer_id -> mdata.customers, so TRK->TRANSP / TRK->USMCA could only be recorded as free text in lessee_name with no FK and no entity scoping. EXACTLY ONE of lessee_operating_company_id / lessee_customer_id via num_nonnulls()=1 (ck_lease_contract_lessee_exactly_one) — an at-most-one CHECK would still permit BOTH NULL, leaving the lessee identified only by free-text lessee_name; a contract may not name its lessor as lessee (ck_lease_contract_no_self_lease).';
