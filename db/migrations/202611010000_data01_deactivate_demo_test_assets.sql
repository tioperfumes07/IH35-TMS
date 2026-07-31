-- DATA-01 — DEACTIVATE (never delete) the demo/test assets still live on production.
--
-- OWNER INSTRUCTION 2026-07-31: "delete all demo and test vehicles, repair order, maintenance order,
-- in assets" → then, after reviewing the evidence below: "ok deactivate". This migration DEACTIVATES.
-- Nothing is deleted. That is not a softening of the instruction, it is the instruction as amended by
-- the owner once the blast radius was shown.
--
-- WHY DELETE WAS THE WRONG TOOL, measured on prod rather than argued from principle:
--   mdata.units            87 inbound foreign keys
--   maintenance.work_orders 22
--   mdata.equipment         16
--   maintenance.pm_schedules 2
-- and 3 REAL loads reference demo units. A DELETE either fails on those constraints or cascades
-- through them, taking work orders, load history and settlement lineage with it. QuickBooks, NetSuite
-- and McLeod all retire assets by marking them inactive and never destroy them, for exactly this
-- reason. This company is in Ch.11 with DOT-relevant asset records: an auditor, lender, insurer or
-- court may need to see what the fleet looked like on a given date. Deactivation preserves that;
-- deletion forecloses it permanently. void-not-delete is also §2 law in this repo.
--
-- TARGETING — EXPLICIT UUIDs, NOT A NAME PATTERN.
-- Every id below was read from prod and is listed literally. A name pattern like ILIKE '%test%' is how
-- a genuine unit called "Test Fleet" or a customer trailer "TESTA-1" gets retired by accident. The
-- pattern was used to FIND these rows; it is not used to CHANGE them.
--
-- WHAT IS ALREADY DONE (verified, so this migration does not pretend to do it):
--   all 20 demo/test mdata.units  — already deactivated
--   DEMO-WO-001, DEMO-WO-002      — already voided (which is why the Maintenance board correctly
--                                   showed OPEN WOS 0; that zero was right, not a broken read)
-- Only 9 equipment rows and 30 pm_schedules are still live. Those are what this touches.
--
-- CONSTRAINT CHECK DONE FIRST, because this is exactly how migration 202610260000 took production down
-- for ~5.5 hours: it set deactivated_at on mdata.drivers without moving `status`, violating
-- chk_drivers_status_deactivated_consistent, and CI could not catch it because a fresh database has no
-- rows to violate anything. The equivalent constraint here is
--   chk_equipment_archive_status_deactivated:
--     CHECK (status NOT IN ('Sold','Lost','Damaged','Transferred') OR deactivated_at IS NOT NULL)
-- which only ever REQUIRES deactivated_at — it can never be violated by SETTING it. That is the
-- inverse of the drivers trap. Confirmed on prod before writing a line of this file.
-- Status is deliberately NOT changed: 96 already-deactivated equipment rows on prod still carry
-- status='InService', so leaving status alone matches the established house convention rather than
-- inventing a new one in a data migration.

DO $$
DECLARE
  v_equipment_ids uuid[] := ARRAY[
    '3cf5e30a-9f82-42fd-9c06-0b240047782e',  -- DEMO-T106
    'e4645de0-7397-4a98-bf32-03794e7c89c3',  -- DEMO-TR01
    'f4eeaf30-a271-43e9-8446-132920ee5b18',  -- DEMO-TR02
    '4203bfe5-7f70-498a-a289-97fd990dac1c',  -- DEMO-TR03
    '87007985-ec78-46d1-8eda-ca85e4c95e93',  -- DEMO-TR04
    'bbffab70-4318-4de5-97c8-a07e1ffa2f27',  -- TEST-TRAILER-1
    'de8bc012-2fb9-4a90-bf27-1b62b30f6ffe',  -- TEST-TRAILER-2
    '93c1edac-1762-468f-b02e-0a2756f13c7b',  -- TEST-TRAILER-3
    '9faa0cb9-8f5b-40e0-afb2-a9f1c908428c'   -- TEST-TRAILER-4
  ]::uuid[];
  v_equipment_done int;
  v_pm_done int;
  v_pm_on_live int;
  v_guard int;
BEGIN
  -- SAFETY ARM 1: refuse to run if any targeted id is NOT a demo/test row. If a future edit pastes a
  -- real trailer's uuid into the array above, this aborts instead of retiring a live asset. The name
  -- check belongs HERE, as an assertion about the explicit list, not as the selector.
  SELECT count(*) INTO v_guard
    FROM mdata.equipment
   WHERE id = ANY(v_equipment_ids)
     AND equipment_number !~* '^(DEMO|TEST|U-DEMO|U-TEST)';
  IF v_guard <> 0 THEN
    RAISE EXCEPTION 'DATA-01: % targeted equipment row(s) are NOT demo/test. Refusing to deactivate real assets.', v_guard;
  END IF;

  -- ── EQUIPMENT. Idempotent: only rows still live are touched, so a re-run changes nothing.
  -- currently_leased_to_company_id is cleared in the SAME statement. A deactivated trailer is not
  -- leased to anyone, and leaving the pointer set would keep these 9 inside every "trailers leased to
  -- TRANSP" count that does not also filter deactivated_at — which is precisely the kind of half-fix
  -- that leaves a wrong number on a screen and calls the job done. The prior values remain recoverable
  -- from audit.row_changes via trg_audit_equipment, so this is reversible.
  UPDATE mdata.equipment
     SET deactivated_at = now(),
         currently_leased_to_company_id = NULL
   WHERE id = ANY(v_equipment_ids)
     AND deactivated_at IS NULL;
  GET DIAGNOSTICS v_equipment_done = ROW_COUNT;

  -- ── PM SCHEDULES. Targeted by a STRUCTURAL FACT, not by name: a preventive-maintenance schedule
  -- attached to a deactivated unit cannot come due, because the unit is retired. That is a general
  -- correctness invariant which happens to cover these rows, and it is safer than matching labels —
  -- 27 of the 30 carry ordinary labels (oil, tires, brake, dot_inspection, transmission, coolant) and
  -- would survive any "DEMO" pattern while still hanging off retired demo trucks.
  -- Verified on prod: 30 of 30 pm_schedules sit on deactivated units; 0 on live units; 0 orphaned.
  UPDATE maintenance.pm_schedules p
     SET is_active = false
    FROM mdata.units u
   WHERE u.id = p.unit_id
     AND u.deactivated_at IS NOT NULL
     AND p.is_active = true;
  GET DIAGNOSTICS v_pm_done = ROW_COUNT;

  -- SAFETY ARM 2: no schedule on a LIVE unit may have been touched. Fail closed if the join drifted.
  SELECT count(*) INTO v_pm_on_live
    FROM maintenance.pm_schedules p
    JOIN mdata.units u ON u.id = p.unit_id
   WHERE u.deactivated_at IS NULL
     AND p.is_active = false;
  IF v_pm_on_live <> 0 THEN
    RAISE EXCEPTION 'DATA-01: % schedule(s) on LIVE units are inactive — unexpected, aborting.', v_pm_on_live;
  END IF;

  RAISE NOTICE 'DATA-01: deactivated % demo/test equipment row(s), % pm_schedule(s) on retired units.',
    v_equipment_done, v_pm_done;

  -- THE REAL EXPOSURE THIS UNCOVERS, recorded here because the number will now look worse and that is
  -- the point: every one of the 30 pm_schedules on prod belongs to a DEMO unit. After this runs, the
  -- live fleet has ZERO preventive-maintenance schedules. The demo data was masking a genuine DOT gap.
  -- The Maintenance PM Countdown will correctly read "No active schedule" — correct, and now true.
END $$;
