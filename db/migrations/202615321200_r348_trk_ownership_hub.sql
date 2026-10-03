-- ROUND 348 — TRK ownership hub remaster (owner 2026-10-02)
-- Verbatim: "THEN ITS THE TRUCKS AND THE TRAILERS. THEY ARE TRUCKING. YES, LEASED TO USMCA."
--
-- STEP 1 — correct the hub (source of truth):
--   mdata.equipment 112 USMCA-owned → TRK owned / leased to USMCA (status untouched)
--   mdata.units       3 USMCA-owned SAM stubs → TRK owned / leased to USMCA (status untouched)
-- Company ids resolved by org.companies.code — NEVER paste a uuid.
--
-- STEP 2 — populate mdata.assets.owning_entity (+ new owning_company_id) FROM the corrected hub.
--   Expect 91 of 100 USMCA-tenant assets filled (38 unit→TRK + 2 unit→TRANSP + 21 equip→TRK
--   + 30 equip→was-USMCA-now-TRK). Leave the 9 unlinked NULL (TEST/CODEX/DEVIN unit_codes —
--   report in PR; do NOT guess TRK onto insured blanks).
--   Do NOT touch TRANSP-tenant assets (43 rows; owning_entity already correct).
--
-- STEP 3 — make the defect impossible:
--   owning_company_id uuid FK → org.companies
--   keep owning_entity text (assets.routes.ts still reads it)
--   UNIQUE (owner_company_id, id) on units + equipment (CC-3 composite same-entity prerequisite)
--   composite FKs: assets (owning_company_id, unit_id) → units (owner_company_id, id)
--                  assets (owning_company_id, equipment_id) → equipment (owner_company_id, id)
--   MATCH SIMPLE: NULL unit_id / equipment_id / owning_company_id skips (the 9 stay blank).
--   NOT NULL on owning_entity is NOT added yet — only AFTER the 9 are identified from paperwork.
--
-- Idempotent. CREATE-only. No seed. No insurance.* / factoring.* / type_catalog touch.
-- No DELETE. Status columns untouched.

-- ─── STEP 1a — equipment hub ───────────────────────────────────────────────
UPDATE mdata.equipment e
   SET owner_company_id = trk.id,
       currently_leased_to_company_id = usmca.id,
       updated_at = now()
  FROM org.companies trk
  CROSS JOIN org.companies usmca
 WHERE trk.code = 'TRK'
   AND usmca.code = 'USMCA'
   AND e.owner_company_id = usmca.id;

-- ─── STEP 1b — units hub (3 SAM stubs) ─────────────────────────────────────
UPDATE mdata.units u
   SET owner_company_id = trk.id,
       currently_leased_to_company_id = usmca.id,
       updated_at = now()
  FROM org.companies trk
  CROSS JOIN org.companies usmca
 WHERE trk.code = 'TRK'
   AND usmca.code = 'USMCA'
   AND u.owner_company_id = usmca.id;

-- ─── STEP 3 prep — owning_company_id column (before populate) ──────────────
ALTER TABLE mdata.assets
  ADD COLUMN IF NOT EXISTS owning_company_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'mdata.assets'::regclass
       AND conname = 'assets_owning_company_id_fkey'
  ) THEN
    ALTER TABLE mdata.assets
      ADD CONSTRAINT assets_owning_company_id_fkey
      FOREIGN KEY (owning_company_id) REFERENCES org.companies (id);
  END IF;
END $$;

-- ─── STEP 2a — assets via linked unit (prefer unit over equipment) ─────────
UPDATE mdata.assets a
   SET owning_entity = c.code,
       owning_company_id = u.owner_company_id,
       updated_at = now()
  FROM mdata.units u
  JOIN org.companies c ON c.id = u.owner_company_id
  JOIN org.companies usmca ON usmca.code = 'USMCA'
 WHERE a.unit_id = u.id
   AND a.operating_company_id = usmca.id
   AND a.owning_entity IS NULL;

-- ─── STEP 2b — assets via linked equipment only (no unit link) ─────────────
UPDATE mdata.assets a
   SET owning_entity = c.code,
       owning_company_id = e.owner_company_id,
       updated_at = now()
  FROM mdata.equipment e
  JOIN org.companies c ON c.id = e.owner_company_id
  JOIN org.companies usmca ON usmca.code = 'USMCA'
 WHERE a.equipment_id = e.id
   AND a.unit_id IS NULL
   AND a.operating_company_id = usmca.id
   AND a.owning_entity IS NULL;

-- ─── STEP 3 — composite same-entity FKs (CC-3 shape) ───────────────────────
-- Prerequisite UNIQUE (owner_company_id, id) so composite FK can reference it.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'mdata.units'::regclass
       AND conname = 'units_owner_company_id_id_key'
  ) THEN
    ALTER TABLE mdata.units
      ADD CONSTRAINT units_owner_company_id_id_key UNIQUE (owner_company_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'mdata.equipment'::regclass
       AND conname = 'equipment_owner_company_id_id_key'
  ) THEN
    ALTER TABLE mdata.equipment
      ADD CONSTRAINT equipment_owner_company_id_id_key UNIQUE (owner_company_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'mdata.assets'::regclass
       AND conname = 'assets_unit_owner_same_entity_fkey'
  ) THEN
    ALTER TABLE mdata.assets
      ADD CONSTRAINT assets_unit_owner_same_entity_fkey
      FOREIGN KEY (owning_company_id, unit_id)
      REFERENCES mdata.units (owner_company_id, id)
      NOT VALID;
  END IF;
END $$;
ALTER TABLE mdata.assets VALIDATE CONSTRAINT assets_unit_owner_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'mdata.assets'::regclass
       AND conname = 'assets_equipment_owner_same_entity_fkey'
  ) THEN
    ALTER TABLE mdata.assets
      ADD CONSTRAINT assets_equipment_owner_same_entity_fkey
      FOREIGN KEY (owning_company_id, equipment_id)
      REFERENCES mdata.equipment (owner_company_id, id)
      NOT VALID;
  END IF;
END $$;
ALTER TABLE mdata.assets VALIDATE CONSTRAINT assets_equipment_owner_same_entity_fkey;

-- NOT NULL on owning_entity deferred until the 9 unlinked unit_codes are identified
-- from paperwork (CODEX-*/DEVIN-*/TEST-* fixtures). State in PR; do not forget.
