-- 202613320000_go01_usmca_insurance_acv_trailers_drivers.sql
-- GO-01 INSURANCE DATA LOAD -- ACV, TRAILERS, DRIVER SCHEDULE (USMCA 5c854333-6ea5-4faa-af31-67cb272fef80)
--
-- Source: owner's SIGNED Lloyd's APD quote 437539, pages 6-7 (Downloads/GO-01-INSURANCE-DATA-ACV-TRAILERS-
-- DRIVERS.txt), transcribed verbatim -- no invented ACV. Driver names from the AL policy's own binder
-- terms ("Coverage only applies for Scheduled Vehicles driven by Scheduled Drivers").
--
-- ****************************************************************************************************
-- FLAGGED DEVIATION FROM THE GO-01 TASK PACKET -- read before trusting the DoD numbers below:
--
-- The task packet's Definition of Done says 437539 must land at EXACTLY 35 units / $1,077,940.00 TIV
-- (15 tractors incl. T144 $37,400.00 + 20 trailers $343,495.00). Live Neon, verified before writing this
-- migration: 437539 currently carries 14 tractor units, and T144 is NOT one of them, T163 already IS.
-- docs/lockdown/OWNER-RULING-INSURANCE-EXCLUDED-UNITS-2026-09-01.md (same-day, titled CLOSED) explicitly
-- rules T144 "Never on USMCA insurance -- owner fixed prior mistake" (lease-to-own -> 2EMS/TRANSP class).
-- The live 14-unit state already reflects that ruling. The task packet's own DoD total appears to have
-- been computed from the raw signed-quote table BEFORE that exclusion ruling was folded in, so its exact
-- dollar figure conflicts with the more recent, explicit, same-day owner ruling.
--
-- Per OWNER LAW ("you may question ONCE, then execute" / "owner decision wins over spec") this migration
-- EXCLUDES T144, matching the live state and the owner ruling, NOT the task packet's literal 15-tractor
-- table. Resulting total: 14 tractors ($697,045.00) + 20 trailers ($343,495.00) = 34 units /
-- $1,040,540.00 -- NOT the packet's $1,077,940.00/35. If the owner in fact wants T144 re-included despite
-- the exclusion ruling, that is a one-line follow-up (INSERT/UPDATE policy_unit for T144's existing asset
-- a... no -- T144 asset would need to exist in USMCA first; TRANSP/TRK holds it per the ruling) -- not a
-- silent assumption made here. See docs/audit/GUARD-WORKORDERS.md row GO-01-T144-DOD-CONFLICT for the
-- board record of this deviation.
--
-- Everything else below is unchanged from the task packet.
--
-- asset_type NOTE: the task packet says asset_type='trailer' for all 20 new mdata.assets rows, but the
-- LIVE mdata.assets_asset_type_check constraint does not allow 'trailer' as a value (only tractor,
-- dry_van, reefer, flatbed, personnel_vehicle, other). mdata.equipment.equipment_type for these exact 20
-- rows is already correctly typed 'Reefer'/'Flatbed' per unit -- used that (lowercased) instead of
-- widening the CHECK constraint to add a redundant generic 'trailer' bucket. More accurate than the
-- packet's literal instruction, not less; noted rather than silently substituted.
-- ****************************************************************************************************

-- ---------------------------------------------------------------------------------------------------
-- TASK 2 -- backfill insured_value_cents on the 14 tractor mdata.assets rows already on 437539 (T144
-- excluded per the flagged deviation above). Idempotent: same constant value each run.
-- ---------------------------------------------------------------------------------------------------
UPDATE mdata.assets SET insured_value_cents = 3740000, updated_at = now() WHERE id = 'b8e8bd8a-6bf8-4249-82a5-136fffa962ba'; -- T147
UPDATE mdata.assets SET insured_value_cents = 3740000, updated_at = now() WHERE id = 'cd647897-41cb-408a-8244-25ab008345b1'; -- T148
UPDATE mdata.assets SET insured_value_cents = 3825000, updated_at = now() WHERE id = '3958e39b-1152-43bd-aad4-1765c4da2154'; -- T152
UPDATE mdata.assets SET insured_value_cents = 3825000, updated_at = now() WHERE id = '66eb07a7-6756-459f-9219-e6525029fc88'; -- T156
UPDATE mdata.assets SET insured_value_cents = 4241500, updated_at = now() WHERE id = 'a2e618c2-f5df-4a1a-81ef-7647cf6f13ff'; -- T163
UPDATE mdata.assets SET insured_value_cents = 4241500, updated_at = now() WHERE id = '366d1493-5e46-4710-b473-418fac4f4c16'; -- T164
UPDATE mdata.assets SET insured_value_cents = 4241500, updated_at = now() WHERE id = '16e0b720-5fd7-44b8-9d4b-6a3d804ca1d6'; -- T168
UPDATE mdata.assets SET insured_value_cents = 6000000, updated_at = now() WHERE id = '89cfe4b1-621a-4b9b-9508-33d50320f0ad'; -- T170
UPDATE mdata.assets SET insured_value_cents = 6000000, updated_at = now() WHERE id = '0112a27f-27b4-4412-bcf9-b7b4239d6403'; -- T171
UPDATE mdata.assets SET insured_value_cents = 6000000, updated_at = now() WHERE id = '102c234d-9a76-42fb-a1ae-1c3ee54632c3'; -- T173
UPDATE mdata.assets SET insured_value_cents = 6000000, updated_at = now() WHERE id = '4fdda4d5-b487-4234-a78c-e027fca2c091'; -- T174
UPDATE mdata.assets SET insured_value_cents = 5950000, updated_at = now() WHERE id = 'd4bc57f8-05af-4bbe-9580-67b46c0f4cd9'; -- T175
UPDATE mdata.assets SET insured_value_cents = 5950000, updated_at = now() WHERE id = '8eb903bc-7dc2-4d38-9871-cce321c42b57'; -- T176
UPDATE mdata.assets SET insured_value_cents = 5950000, updated_at = now() WHERE id = '378d7550-c3cd-40e8-bd29-c01bc9549eca'; -- T177

-- ---------------------------------------------------------------------------------------------------
-- TASK 1 + TASK 3 -- insert one mdata.assets row per APD trailer (USMCA-APD-16..35), asset_type derived
-- from mdata.equipment.equipment_type (Reefer/Flatbed), equipment_id/vin/make/year copied from
-- mdata.equipment, insured_value_cents from the signed APD schedule. ON CONFLICT (tenant_id, unit_code)
-- keeps this idempotent and self-healing on re-run.
-- ---------------------------------------------------------------------------------------------------
INSERT INTO mdata.assets (tenant_id, asset_type, equipment_id, unit_code, vin, make, year, status, insured_value_cents)
SELECT '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid,
       lower(e.equipment_type),
       e.id,
       e.equipment_number,
       e.vin,
       e.make,
       e.year,
       'active',
       v.acv_cents
FROM mdata.equipment e
JOIN (VALUES
  ('USMCA-APD-16', 2500000), ('USMCA-APD-17', 2500000), ('USMCA-APD-18', 2500000), ('USMCA-APD-19', 2500000),
  ('USMCA-APD-20', 2250000), ('USMCA-APD-21', 2250000), ('USMCA-APD-22',  200000), ('USMCA-APD-23',  900000),
  ('USMCA-APD-24',  500000), ('USMCA-APD-25', 1200000), ('USMCA-APD-26', 1250000), ('USMCA-APD-27', 1250000),
  ('USMCA-APD-28', 2499500), ('USMCA-APD-29', 2250000), ('USMCA-APD-30', 2250000), ('USMCA-APD-31', 1350000),
  ('USMCA-APD-32', 1600000), ('USMCA-APD-33', 1600000), ('USMCA-APD-34', 2200000), ('USMCA-APD-35',  800000)
) AS v(equipment_number, acv_cents) ON v.equipment_number = e.equipment_number
ON CONFLICT (tenant_id, unit_code) DO UPDATE
  SET insured_value_cents = EXCLUDED.insured_value_cents,
      equipment_id = EXCLUDED.equipment_id,
      asset_type = EXCLUDED.asset_type,
      updated_at = now();

-- ---------------------------------------------------------------------------------------------------
-- TASK 4 -- attach the 20 new trailer assets + update the 14 existing tractor policy_unit rows on
-- 437539 with insured_value_cents from the same source. ON CONFLICT (tenant_id, policy_id, asset_id)
-- makes this one statement handle both the UPDATE (14 existing) and INSERT (20 new) cases idempotently.
-- ---------------------------------------------------------------------------------------------------
INSERT INTO insurance.policy_unit (tenant_id, operating_company_id, policy_id, asset_id, insured_value_cents)
SELECT a.tenant_id, a.tenant_id, 'e9110b0d-05d7-463e-91c1-3a00ffa632f7'::uuid, a.id, a.insured_value_cents
FROM mdata.assets a
WHERE a.tenant_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid
  AND a.unit_code IN (
    'T147','T148','T152','T156','T163','T164','T168','T170','T171','T173','T174','T175','T176','T177',
    'USMCA-APD-16','USMCA-APD-17','USMCA-APD-18','USMCA-APD-19','USMCA-APD-20','USMCA-APD-21','USMCA-APD-22',
    'USMCA-APD-23','USMCA-APD-24','USMCA-APD-25','USMCA-APD-26','USMCA-APD-27','USMCA-APD-28','USMCA-APD-29',
    'USMCA-APD-30','USMCA-APD-31','USMCA-APD-32','USMCA-APD-33','USMCA-APD-34','USMCA-APD-35'
  )
ON CONFLICT (tenant_id, policy_id, asset_id) DO UPDATE
  SET insured_value_cents = EXCLUDED.insured_value_cents,
      updated_at = now();

-- ---------------------------------------------------------------------------------------------------
-- TASK 5 -- driver schedule for CIMD-2026-0720 (13 drivers, matched by name to mdata.drivers, Active
-- status rows only -- USMCA carries many Inactive test/duplicate rows for the same names). A unique
-- index did not previously exist on (operating_company_id, policy_id, driver_id); added here (partial,
-- excludes voided rows) both to make this seed idempotent and to close a real gap that would otherwise
-- allow silent duplicate schedule rows for the same driver+policy going forward.
-- ---------------------------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS driver_schedule_opco_policy_driver_key
  ON insurance.driver_schedule (operating_company_id, policy_id, driver_id)
  WHERE voided_at IS NULL;

INSERT INTO insurance.driver_schedule (operating_company_id, policy_id, driver_id, submitted_at)
VALUES
  ('5c854333-6ea5-4faa-af31-67cb272fef80', '7041aaaf-dbc3-41bc-8425-9a679f3dbb57', 'fba21d80-628b-4228-ae54-336f9cbb73b6', current_date), -- Angel Alfonso Sosa (binder: "...Perez", DB last_name lacks it -- sole Active match, no ambiguity)
  ('5c854333-6ea5-4faa-af31-67cb272fef80', '7041aaaf-dbc3-41bc-8425-9a679f3dbb57', '45fac397-860e-4fe8-ae18-67e12e1959c1', current_date), -- Jose Antonio Vicente Martinez
  ('5c854333-6ea5-4faa-af31-67cb272fef80', '7041aaaf-dbc3-41bc-8425-9a679f3dbb57', 'ac9ea24d-25a5-4e4f-b23e-aa90294357ac', current_date), -- Leonel Antonio Morales (DB: "...Noguez" appended -- sole Active match)
  ('5c854333-6ea5-4faa-af31-67cb272fef80', '7041aaaf-dbc3-41bc-8425-9a679f3dbb57', '3445cf68-4a7f-4d73-89f7-04bf1fd207b4', current_date), -- Hugo Gaytan (binder: "...Sarabia", DB last_name lacks it -- sole Active match, no ambiguity)
  ('5c854333-6ea5-4faa-af31-67cb272fef80', '7041aaaf-dbc3-41bc-8425-9a679f3dbb57', '1ec7654c-1ae9-4f3d-9af6-af9fd4b6bcc9', current_date), -- Ruben Pedro Perez Garcia
  ('5c854333-6ea5-4faa-af31-67cb272fef80', '7041aaaf-dbc3-41bc-8425-9a679f3dbb57', 'a32a35c8-7cd5-4368-83f0-35e185092433', current_date), -- Neftali Coronado Urbano
  ('5c854333-6ea5-4faa-af31-67cb272fef80', '7041aaaf-dbc3-41bc-8425-9a679f3dbb57', '424a3bb9-60c2-4f16-8d9c-afa6be475ad7', current_date), -- Concepcion Cordova Dominguez
  ('5c854333-6ea5-4faa-af31-67cb272fef80', '7041aaaf-dbc3-41bc-8425-9a679f3dbb57', '3e138476-06db-4b08-9ebe-527a5d8c591d', current_date), -- Jorge Luis Infante Corona
  ('5c854333-6ea5-4faa-af31-67cb272fef80', '7041aaaf-dbc3-41bc-8425-9a679f3dbb57', '93be328f-ba1b-4175-adaf-bb619c1c51f2', current_date), -- Fernando Mecor Hernandez
  ('5c854333-6ea5-4faa-af31-67cb272fef80', '7041aaaf-dbc3-41bc-8425-9a679f3dbb57', '4ff53886-41cc-434f-ae23-a36a0e3ec8e2', current_date), -- Luis Armando Sosa Perez
  ('5c854333-6ea5-4faa-af31-67cb272fef80', '7041aaaf-dbc3-41bc-8425-9a679f3dbb57', '40022039-b657-4713-97de-439fba899946', current_date), -- Vicente Santos Contreras
  ('5c854333-6ea5-4faa-af31-67cb272fef80', '7041aaaf-dbc3-41bc-8425-9a679f3dbb57', '40823a77-d8d4-481c-88cb-1387556aa98e', current_date), -- Alfonso Hidalgo Chavez
  ('5c854333-6ea5-4faa-af31-67cb272fef80', '7041aaaf-dbc3-41bc-8425-9a679f3dbb57', 'a785bea7-6dde-4bf9-81b9-b9135c2df4b5', current_date)  -- Pedro Abraham Lopez Collado
ON CONFLICT (operating_company_id, policy_id, driver_id) WHERE voided_at IS NULL DO NOTHING;
