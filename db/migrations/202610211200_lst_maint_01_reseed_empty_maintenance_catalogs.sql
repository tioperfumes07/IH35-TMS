-- LST-MAINT-01 — RLS-safe reseed of empty maintenance factory catalogs (0066 defaults).
-- ROOT CAUSE: 0066 seeded as migration owner then DROPPED the helper; under FORCE RLS the
-- INSERTs never landed (0 rows TRANSP/USMCA/TRK). Badge MAINTENANCE=0 is honest empty.
-- FIX: re-insert the same 0066 codes as ih35_app with per-opco GUC + bypass_rls, ON CONFLICT DO NOTHING.
-- Does NOT invent new taxonomy; does NOT touch catalogs.parts (different shape) or reference.oem_parts.

DO $$
DECLARE
  rec RECORD;
  v_role_ok boolean := false;
BEGIN
  BEGIN
    EXECUTE 'SET LOCAL ROLE ih35_app';
    v_role_ok := true;
  EXCEPTION
    WHEN undefined_object OR insufficient_privilege THEN
      RAISE NOTICE 'LST-MAINT-01: cannot SET ROLE ih35_app — skip (owner Neon-apply as app role)';
      RETURN;
  END;

  PERFORM set_config('app.bypass_rls', 'lucia', true);

  FOR rec IN
    SELECT c.id AS company_id, c.code
    FROM org.companies c
    WHERE c.deactivated_at IS NULL
      AND c.code IN ('TRANSP', 'USMCA', 'TRK')
  LOOP
    PERFORM set_config('app.operating_company_id', rec.company_id::text, true);

    -- work_order_statuses
    INSERT INTO catalogs.work_order_statuses
      (operating_company_id, code, display_name, description, metadata, is_active, sort_order)
    VALUES
      (rec.company_id, 'OPEN', 'Open', 'Work order created and pending', '{}'::jsonb, true, 10),
      (rec.company_id, 'IN-TRIAGE', 'In triage', 'Work order under initial review', '{}'::jsonb, true, 20),
      (rec.company_id, 'IN-PROGRESS', 'In progress', 'Repair work underway', '{}'::jsonb, true, 30),
      (rec.company_id, 'ON-HOLD', 'On hold', 'Awaiting parts/approval/resources', '{}'::jsonb, true, 40),
      (rec.company_id, 'COMPLETE', 'Complete', 'Repair completed and closed', '{}'::jsonb, true, 50)
    ON CONFLICT (operating_company_id, code) DO NOTHING;

    INSERT INTO catalogs.maintenance_priority_levels
      (operating_company_id, code, display_name, description, metadata, is_active, sort_order)
    VALUES
      (rec.company_id, 'P1-CRITICAL', 'P1 Critical', 'Unsafe to operate, immediate action required', '{"priority":1}'::jsonb, true, 10),
      (rec.company_id, 'P2-HIGH', 'P2 High', 'Major defect, schedule as soon as possible', '{"priority":2}'::jsonb, true, 20),
      (rec.company_id, 'P3-MEDIUM', 'P3 Medium', 'Operational but needs timely repair', '{"priority":3}'::jsonb, true, 30),
      (rec.company_id, 'P4-LOW', 'P4 Low', 'Minor issue, schedule with next service', '{"priority":4}'::jsonb, true, 40),
      (rec.company_id, 'P5-PLANNED', 'P5 Planned', 'Planned maintenance or optimization', '{"priority":5}'::jsonb, true, 50)
    ON CONFLICT (operating_company_id, code) DO NOTHING;

    INSERT INTO catalogs.maintenance_failure_codes
      (operating_company_id, code, display_name, description, metadata, is_active, sort_order)
    VALUES
      (rec.company_id, 'BRAKE-LOW-PRESSURE', 'Brake low pressure', 'Brake air pressure below threshold', '{}'::jsonb, true, 10),
      (rec.company_id, 'ELECTRICAL-SHORT', 'Electrical short', 'Electrical short circuit detected', '{}'::jsonb, true, 20),
      (rec.company_id, 'ABS-FAULT', 'ABS fault', 'ABS warning or sensor failure', '{}'::jsonb, true, 30),
      (rec.company_id, 'AIR-LEAK', 'Air leak', 'Air system leak requiring repair', '{}'::jsonb, true, 40),
      (rec.company_id, 'TIRE-IRREGULAR-WEAR', 'Tire irregular wear', 'Uneven tire wear pattern detected', '{}'::jsonb, true, 50)
    ON CONFLICT (operating_company_id, code) DO NOTHING;

    INSERT INTO catalogs.maintenance_labor_codes
      (operating_company_id, code, display_name, description, metadata, is_active, sort_order)
    VALUES
      (rec.company_id, 'INSPECTION', 'Inspection', 'General inspection labor', '{}'::jsonb, true, 10),
      (rec.company_id, 'PM-SERVICE', 'PM service', 'Preventive maintenance service labor', '{}'::jsonb, true, 20),
      (rec.company_id, 'BRAKE-REPAIR', 'Brake repair', 'Brake service and repair labor', '{}'::jsonb, true, 30),
      (rec.company_id, 'ELECTRICAL-REPAIR', 'Electrical repair', 'Electrical diagnostic and repair labor', '{}'::jsonb, true, 40),
      (rec.company_id, 'ROAD-CALL', 'Road call', 'Emergency roadside service labor', '{}'::jsonb, true, 50)
    ON CONFLICT (operating_company_id, code) DO NOTHING;

    INSERT INTO catalogs.maintenance_service_tasks
      (operating_company_id, code, display_name, description, metadata, is_active, sort_order)
    VALUES
      (rec.company_id, 'PM-A-CHECKLIST', 'PM-A checklist', 'Basic PM-A checklist service task', '{}'::jsonb, true, 10),
      (rec.company_id, 'PM-B-CHECKLIST', 'PM-B checklist', 'Advanced PM-B checklist service task', '{}'::jsonb, true, 20),
      (rec.company_id, 'DOT-INSPECTION', 'DOT inspection', 'Annual DOT inspection workflow', '{}'::jsonb, true, 30),
      (rec.company_id, 'BRAKE-ADJUSTMENT', 'Brake adjustment', 'Brake adjustment and verification task', '{}'::jsonb, true, 40),
      (rec.company_id, 'TIRE-ROTATION', 'Tire rotation', 'Tire rotation and balancing task', '{}'::jsonb, true, 50)
    ON CONFLICT (operating_company_id, code) DO NOTHING;

    INSERT INTO catalogs.maintenance_shop_locations
      (operating_company_id, code, display_name, description, metadata, is_active, sort_order)
    VALUES
      (rec.company_id, 'LAREDO-MAIN-SHOP', 'Laredo main shop', 'Primary in-house maintenance facility', '{}'::jsonb, true, 10),
      (rec.company_id, 'SAN-ANTONIO-YARD', 'San Antonio yard', 'Regional yard maintenance bay', '{}'::jsonb, true, 20),
      (rec.company_id, 'HOUSTON-SATELLITE', 'Houston satellite', 'Satellite maintenance location', '{}'::jsonb, true, 30),
      (rec.company_id, 'ROADSIDE-NETWORK', 'Roadside network', 'Approved roadside partner network', '{}'::jsonb, true, 40),
      (rec.company_id, 'VENDOR-SHOP', 'Vendor shop', 'External vendor shop location', '{}'::jsonb, true, 50)
    ON CONFLICT (operating_company_id, code) DO NOTHING;

    IF to_regclass('catalogs.maintenance_vendors') IS NOT NULL THEN
      INSERT INTO catalogs.maintenance_vendors
        (operating_company_id, code, display_name, description, metadata, is_active, sort_order)
      VALUES
        (rec.company_id, 'GOODYEAR-COMMERCIAL', 'Goodyear Commercial', 'Preferred tire and service vendor', '{}'::jsonb, true, 10),
        (rec.company_id, 'FLEETPRIDE', 'FleetPride', 'Parts and heavy-duty vendor', '{}'::jsonb, true, 20),
        (rec.company_id, 'LOVE-TRUCK-CARE', 'Love Truck Care', 'Roadside and shop repair vendor', '{}'::jsonb, true, 30),
        (rec.company_id, 'TA-SERVICE', 'TA Service', 'Travel center repair network', '{}'::jsonb, true, 40),
        (rec.company_id, 'INDEPENDENT-SHOP', 'Independent shop', 'Local independent maintenance provider', '{}'::jsonb, true, 50)
      ON CONFLICT (operating_company_id, code) DO NOTHING;
    END IF;

    IF to_regclass('catalogs.maintenance_parts') IS NOT NULL THEN
      INSERT INTO catalogs.maintenance_parts
        (operating_company_id, code, display_name, description, metadata, is_active, sort_order)
      VALUES
        (rec.company_id, 'OIL-FILTER', 'Oil filter', 'Engine oil filter assembly', '{"part_number":"OF-001"}'::jsonb, true, 10),
        (rec.company_id, 'FUEL-FILTER', 'Fuel filter', 'Primary fuel filter cartridge', '{"part_number":"FF-120"}'::jsonb, true, 20),
        (rec.company_id, 'BRAKE-PAD-SET', 'Brake pad set', 'Axle brake pad replacement set', '{"part_number":"BP-442"}'::jsonb, true, 30),
        (rec.company_id, 'AIR-DRYER', 'Air dryer', 'Air dryer cartridge kit', '{"part_number":"AD-231"}'::jsonb, true, 40),
        (rec.company_id, 'COOLANT-HOSE', 'Coolant hose', 'Engine coolant hose segment', '{"part_number":"CH-090"}'::jsonb, true, 50)
      ON CONFLICT (operating_company_id, code) DO NOTHING;
    END IF;

    RAISE NOTICE 'LST-MAINT-01: seeded factory catalogs for %', rec.code;
  END LOOP;

  -- RESET before DO ends — SET LOCAL ROLE survives the migration txn and blocks
  -- the migrator's INSERT into _system._schema_migrations (CI: permission denied).
  EXECUTE 'RESET ROLE';
END
$$;
