-- LEASE-02 — lease CONTRACTS with per-unit monthly amounts, entered either directly or as a group
-- total spread evenly. Mirrors the insurance format, because the owner named it as the pattern.
--
-- OWNER, 2026-07-30 (verbatim): "when the contract is created in the software, we select the units we
-- will lease and we put the monthly amount for each. and the contract is created. there is a format in
-- legal. one for lease to own and one for lease." and "follow the insurance format. we can input the
-- amount on the selected units on each, or have a total amount trucks-60,000 and spread uniformly
-- between all selected trucks and also trailers- flatbeds-10 selected total amont 8000 a month, and
-- would automatically calculate 800 per flatbed, and reefer 20 reefers 15,000 a month and would
-- automatically calculate 750 a month."
--
-- THE INSURANCE FORMAT, read from the schema rather than assumed (db/migrations/0274_insurance.sql:37):
--     insurance.policy        -- the header
--     insurance.policy_unit   -- one row per asset, insured_value_cents, UNIQUE (tenant, policy, asset)
-- Header plus a per-asset line carrying that asset's own amount. This mirrors it exactly.
--
-- WHAT ALREADY EXISTED, verified before building: legal.contract_templates / contract_instances /
-- contract_instance_links, and BOTH formats as services — legal/truck-lease.service.ts and
-- legal/lease-to-own.service.ts (which already has a fleet unit picker, listFleetUnitsForPicker).
-- What did NOT exist anywhere: a per-unit monthly lease amount. The only *_amount_cents matches in
-- db/migrations were factoring's release_amount_cents — a substring coincidence, not a lease rate.
--
-- ── THE ACCOUNTING TRAP, AND WHY TWO SEPARATE COLUMNS ──────────────────────────────────────────────
-- The legal contract FORMAT ("lease" vs "lease to own") is NOT the ASC 842 CLASSIFICATION. Locked
-- decision 2026-06-29, taken with the owner's accountant present:
--     "B1 = OPTION A — operating lease. Trucking KEEPS the truck on its books, depreciates it 5-yr
--      straight-line, books the lease payments as rental income... Jorge first said Option B, then
--      corrected to A once I flagged that Option B/sales-type would DERECOGNIZE the truck and STOP
--      depreciation. Engine still supports both elections per-deal... Default = A."
-- If lease_to_own auto-elected sales-type, TRK would derecognize the asset and stop depreciating it —
-- silently reversing the correction the owner made with his accountant, and changing TRK's balance
-- sheet and depreciation schedule without anyone choosing it.
-- So: `contract_format` records what the owner selects in Legal. `asc842_classification` is SEPARATE
-- and defaults to 'operating' for BOTH formats. Reclassification stays a per-deal CPA decision.
--
-- ── ALLOCATION MUST FOOT TO THE CENT ───────────────────────────────────────────────────────────────
-- The owner's examples divide evenly (8,000/10 = 800; 15,000/20 = 750). Real ones will not:
-- 60,000 across 7 trucks is 6,000,000 cents / 7 = 857,142.857. A naive even split loses cents, and an
-- allocation whose parts do not sum to the whole is a defect a CPA or auditor reads immediately.
-- So the split uses LARGEST-REMAINDER: base = total / n, and the leftover cents are handed out one
-- each to the first (total mod n) lines by a deterministic order. The per-unit amount is then STORED,
-- never recomputed at read time — the same reason insurance stores insured_value_cents per row. A
-- CHECK plus a fail-closed assertion prove SUM(lines) = group total exactly.

CREATE TABLE IF NOT EXISTS mdata.lease_contracts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),   -- lessee (RLS scope)
  lessor_company_id     uuid NOT NULL REFERENCES org.companies(id),
  lessee_company_id     uuid NOT NULL REFERENCES org.companies(id),
  -- The signed document in Legal. Nullable: a contract may be drafted here before the instance exists.
  contract_instance_id  uuid REFERENCES legal.contract_instances(id),
  -- The LEGAL FORMAT the owner picks. Not an accounting election.
  contract_format       text NOT NULL CHECK (contract_format IN ('lease', 'lease_to_own')),
  -- The ASC 842 election, deliberately independent. Default A per the locked decision.
  asc842_classification text NOT NULL DEFAULT 'operating'
                          CHECK (asc842_classification IN ('operating', 'sales_type', 'direct_financing')),
  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'active', 'ended', 'void')),
  commenced_on          date,
  ended_on              date,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by_user_id    uuid REFERENCES identity.users(id),
  updated_by_user_id    uuid REFERENCES identity.users(id),
  deactivated_at        timestamptz,
  CONSTRAINT ck_lease_contracts_no_self_lease CHECK (lessor_company_id <> lessee_company_id),
  CONSTRAINT ck_lease_contracts_scope_is_lessee CHECK (operating_company_id = lessee_company_id),
  CONSTRAINT ck_lease_contracts_deactivated_implies_inactive
    CHECK (deactivated_at IS NULL OR is_active = false)
);

-- A group is one "trucks 60,000" / "flatbeds 8,000" / "reefers 15,000" line on the contract.
CREATE TABLE IF NOT EXISTS mdata.lease_contract_groups (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  lease_contract_id     uuid NOT NULL REFERENCES mdata.lease_contracts(id),
  -- Free text on purpose: the owner names these ("trucks", "flatbeds", "reefers") and the asset-class
  -- vocabulary lives in catalogs, which must not be hard-coded into a CHECK here.
  asset_group_label     text NOT NULL,
  allocation_method     text NOT NULL CHECK (allocation_method IN ('per_unit', 'even_split')),
  -- Only meaningful for even_split; NULL when each line carries its own amount.
  group_total_cents     bigint CHECK (group_total_cents IS NULL OR group_total_cents >= 0),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_lease_groups_even_split_needs_total
    CHECK (allocation_method <> 'even_split' OR group_total_cents IS NOT NULL)
);

-- The per-asset line. This is insurance.policy_unit's shape: one row per asset, its own amount.
CREATE TABLE IF NOT EXISTS mdata.lease_contract_units (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id   uuid NOT NULL REFERENCES org.companies(id),
  lease_contract_id      uuid NOT NULL REFERENCES mdata.lease_contracts(id),
  lease_contract_group_id uuid REFERENCES mdata.lease_contract_groups(id),
  unit_id                uuid REFERENCES mdata.units(id),
  equipment_id           uuid REFERENCES mdata.equipment(id),
  -- ALWAYS stored, even when derived from an even split, so the amount that was agreed is the amount
  -- that is read. Recomputing at read time would let a later roster change silently restate history.
  monthly_amount_cents   bigint NOT NULL CHECK (monthly_amount_cents >= 0),
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deactivated_at         timestamptz,
  CONSTRAINT ck_lease_units_exactly_one_asset
    CHECK ((unit_id IS NOT NULL) <> (equipment_id IS NOT NULL)),
  CONSTRAINT ck_lease_units_deactivated_implies_inactive
    CHECK (deactivated_at IS NULL OR is_active = false)
);

-- One active line per (contract, asset) — the insurance UNIQUE (tenant, policy, asset), partial so a
-- retired line never blocks re-adding the asset later.
CREATE UNIQUE INDEX IF NOT EXISTS ux_lease_units_contract_unit
  ON mdata.lease_contract_units (lease_contract_id, unit_id)
  WHERE is_active AND deactivated_at IS NULL AND unit_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_lease_units_contract_equipment
  ON mdata.lease_contract_units (lease_contract_id, equipment_id)
  WHERE is_active AND deactivated_at IS NULL AND equipment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lease_contracts_lessee ON mdata.lease_contracts (operating_company_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_lease_contracts_lessor ON mdata.lease_contracts (lessor_company_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_lease_groups_contract ON mdata.lease_contract_groups (lease_contract_id);
CREATE INDEX IF NOT EXISTS idx_lease_units_contract ON mdata.lease_contract_units (lease_contract_id) WHERE is_active;

ALTER TABLE mdata.lease_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.lease_contracts FORCE ROW LEVEL SECURITY;
ALTER TABLE mdata.lease_contract_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.lease_contract_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE mdata.lease_contract_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.lease_contract_units FORCE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lease_contracts','lease_contract_groups','lease_contract_units']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON mdata.%I', t || '_tenant_scope', t);
    -- Bilateral on the header: the lessor must see its own leases, or Trucking — which owns every
    -- asset — could not see a single contract it is party to. Child rows follow the lessee scope.
    IF t = 'lease_contracts' THEN
      EXECUTE format($p$
        CREATE POLICY %I ON mdata.%I FOR ALL TO ih35_app
          USING (identity.is_lucia_bypass()
                 OR operating_company_id::text = current_setting('app.operating_company_id', true)
                 OR lessor_company_id::text = current_setting('app.operating_company_id', true))
          WITH CHECK (identity.is_lucia_bypass()
                 OR operating_company_id::text = current_setting('app.operating_company_id', true))
      $p$, t || '_tenant_scope', t);
    ELSE
      EXECUTE format($p$
        CREATE POLICY %I ON mdata.%I FOR ALL TO ih35_app
          USING (identity.is_lucia_bypass()
                 OR operating_company_id::text = current_setting('app.operating_company_id', true))
          WITH CHECK (identity.is_lucia_bypass()
                 OR operating_company_id::text = current_setting('app.operating_company_id', true))
      $p$, t || '_tenant_scope', t);
    END IF;
    -- 0065 grant pattern. No DELETE: a lease line is a term of a signed contract.
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON mdata.%I TO ih35_app', t);
  END LOOP;
END
$$;

-- ── The even-split allocator, in the database so every caller gets the same footing ────────────────
-- Largest-remainder: base = total / n to every line, then one extra cent to the first (total mod n)
-- lines in a deterministic order. Returns the number of lines written. SUM(lines) = total, exactly.
CREATE OR REPLACE FUNCTION mdata.allocate_lease_group_evenly(p_group_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_total   bigint;
  v_method  text;
  v_n       integer;
  v_base    bigint;
  v_rem     bigint;
  v_written integer;
  v_sum     bigint;
BEGIN
  SELECT group_total_cents, allocation_method INTO v_total, v_method
    FROM mdata.lease_contract_groups WHERE id = p_group_id;

  IF v_method IS DISTINCT FROM 'even_split' THEN
    RAISE EXCEPTION 'allocate_lease_group_evenly: group % is not even_split', p_group_id;
  END IF;

  SELECT count(*) INTO v_n
    FROM mdata.lease_contract_units
   WHERE lease_contract_group_id = p_group_id AND is_active AND deactivated_at IS NULL;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'allocate_lease_group_evenly: group % has no active lines to allocate across', p_group_id;
  END IF;

  v_base := v_total / v_n;
  v_rem  := v_total - (v_base * v_n);   -- 0 .. v_n-1 cents left over

  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY coalesce(unit_id, equipment_id), id) AS rn
      FROM mdata.lease_contract_units
     WHERE lease_contract_group_id = p_group_id AND is_active AND deactivated_at IS NULL
  )
  UPDATE mdata.lease_contract_units u
     SET monthly_amount_cents = v_base + CASE WHEN o.rn <= v_rem THEN 1 ELSE 0 END,
         updated_at = now()
    FROM ordered o
   WHERE u.id = o.id;
  GET DIAGNOSTICS v_written = ROW_COUNT;

  -- Fail closed: the parts must sum to the whole, or the allocation is wrong and must not persist.
  SELECT coalesce(sum(monthly_amount_cents), 0) INTO v_sum
    FROM mdata.lease_contract_units
   WHERE lease_contract_group_id = p_group_id AND is_active AND deactivated_at IS NULL;

  IF v_sum <> v_total THEN
    RAISE EXCEPTION 'allocate_lease_group_evenly: allocation does not foot — group % lines sum to % but the total is %',
      p_group_id, v_sum, v_total;
  END IF;

  RETURN v_written;
END;
$$;

COMMENT ON FUNCTION mdata.allocate_lease_group_evenly(uuid) IS
  'LEASE-02: spreads a lease group total evenly across its active lines using largest-remainder, so the per-unit amounts sum EXACTLY to the group total (8000/10 -> 800 each; 60000/7 -> 857142/857143 cents, footing to the cent). Amounts are STORED on each line, never recomputed at read time. Raises if the sum does not equal the total.';

COMMENT ON TABLE mdata.lease_contracts IS
  'LEASE-02 (2026-07-30): lease contracts, mirroring the insurance header/line format (insurance.policy + insurance.policy_unit). contract_format is the LEGAL format the owner selects in Legal (lease | lease_to_own); asc842_classification is a SEPARATE per-deal accounting election defaulting to operating per the accountant-confirmed locked decision of 2026-06-29 — a lease_to_own contract does NOT auto-elect sales-type, because that would derecognize the truck on TRK and stop its 5-yr depreciation.';

-- ── LINKAGE LAW (§10) — audit spine + hub FKs ─────────────────────────────────────────────────────
-- Every table gets the shared append-only row-mutation audit trigger. Without it an INSERT/UPDATE on a
-- lease leaves NO row in audit.row_changes — and a lease is exactly the record a Ch.11 examiner, a
-- lender or a DOT/insurance reviewer asks to see the history of. Same helper the master tables use
-- (audit.ensure_row_trigger, migration 0276 / 202607051200), so this is the established spine rather
-- than a new one.
SELECT audit.ensure_row_trigger('mdata', 'lease_contracts');
SELECT audit.ensure_row_trigger('mdata', 'lease_contract_groups');
SELECT audit.ensure_row_trigger('mdata', 'lease_contract_units');
SELECT audit.ensure_row_trigger('mdata', 'asset_leases');

-- identity.users is a §10 HUB. created_by/updated_by were plain uuids, so a user id could be stored
-- that resolves to nobody — "who agreed this rate" is the first question asked about a lease.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_lease_contracts_created_by') THEN
    ALTER TABLE mdata.lease_contracts
      ADD CONSTRAINT fk_lease_contracts_created_by FOREIGN KEY (created_by_user_id) REFERENCES identity.users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_lease_contracts_updated_by') THEN
    ALTER TABLE mdata.lease_contracts
      ADD CONSTRAINT fk_lease_contracts_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES identity.users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_asset_leases_created_by') THEN
    ALTER TABLE mdata.asset_leases
      ADD CONSTRAINT fk_asset_leases_created_by FOREIGN KEY (created_by_user_id) REFERENCES identity.users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_asset_leases_updated_by') THEN
    ALTER TABLE mdata.asset_leases
      ADD CONSTRAINT fk_asset_leases_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES identity.users(id);
  END IF;
END
$$;

-- LINKAGE DECLARATION (§10 requires one; a block without it is a defect).
--   canonical targets  : mdata.lease_contracts / _groups / _units, mdata.asset_leases
--                        (to_regclass-resolvable, none is a RETIRE table)
--   hubs linked        : org.companies (lessor + lessee + RLS scope) · mdata.units · mdata.equipment ·
--                        identity.users (created_by/updated_by, FK'd above) · legal.contract_instances
--   forward            : contract -> group -> line -> unit/equipment -> owning + leasing company
--   reverse            : a unit resolves to every contract line and every lease naming it, per lessee
--   entity scope       : operating_company_id = lessee on all three tables, FORCE RLS, bilateral on the
--                        header so the lessor sees leases it is party to
--   audit              : audit.row_changes via the shared trigger, append-only
--   NOT YET LINKED, deliberately: catalogs.accounts and accounting.journal_entries. Rent expense and
--   TRK's rental income need a per-deal ASC 842 election and owner-designated accounts; wiring a GL
--   account here would be a guessed mapping, which §10 and the standard both forbid. Recorded as the
--   next block rather than left implicit.
