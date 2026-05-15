BEGIN;

CREATE SCHEMA IF NOT EXISTS catalogs;

-- ============================================================
-- Helper: create minimal company-scoped catalog table
-- ============================================================
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'civil_fine_types',
    'accident_types',
    'workplace_incident_types',
    'detention_reasons',
    'load_types',
    'lumper_providers',
    'pickup_time_types',
    'additional_charges',
    'mx_customs_brokers',
    'load_trailer_equipment',
    'pay_rate_templates',
    'driver_pay_types',
    'driver_deduction_types',
    'escrow_types',
    'cash_advance_types',
    'leave_types',
    'settlement_templates',
    'pm_intervals',
    'repair_locations',
    'truck_parts',
    'trailer_parts',
    'tire_catalog',
    'battery_catalog',
    'air_bag_catalog',
    'work_order_templates',
    'fuel_stations',
    'fuel_grades',
    'toll_providers',
    'expensive_states',
    'def_stations',
    'relay_accounts',
    'ifta_states',
    'qbo_categories'
  ]
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS catalogs.%I (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        operating_company_id uuid NOT NULL REFERENCES org.companies(id),
        code text NOT NULL,
        display_name text NOT NULL,
        description text,
        metadata jsonb NOT NULL DEFAULT ''{}''::jsonb,
        is_active boolean NOT NULL DEFAULT true,
        sort_order int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (operating_company_id, code)
      )',
      tbl
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%I_company_active ON catalogs.%I (operating_company_id, is_active)',
      tbl,
      tbl
    );
    EXECUTE format('ALTER TABLE catalogs.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON catalogs.%I TO ih35_app', tbl);
    EXECUTE format('DROP POLICY IF EXISTS company_scope ON catalogs.%I', tbl);
    EXECUTE format(
      'CREATE POLICY company_scope
       ON catalogs.%I
       FOR ALL TO ih35_app
       USING (operating_company_id::text = current_setting(''app.operating_company_id'', true))
       WITH CHECK (operating_company_id::text = current_setting(''app.operating_company_id'', true))',
      tbl
    );
  END LOOP;
END
$$;

-- ============================================================
-- Helper: generic company-scoped catalog seeder
-- ============================================================
CREATE OR REPLACE FUNCTION catalogs.__seed_company_catalog(p_table text, p_entries jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  inserted_rows int := 0;
  sql text;
BEGIN
  sql := format(
    $SQL$
      WITH cos AS (
        SELECT id
        FROM org.companies
        WHERE deactivated_at IS NULL
      )
      INSERT INTO catalogs.%I
        (operating_company_id, code, display_name, description, metadata, is_active, sort_order)
      SELECT
        cos.id,
        x.code,
        x.display_name,
        x.description,
        COALESCE(x.metadata, '{}'::jsonb),
        true,
        x.sort_order
      FROM cos
      CROSS JOIN jsonb_to_recordset($1) AS x(
        code text,
        display_name text,
        description text,
        metadata jsonb,
        sort_order int
      )
      ON CONFLICT DO NOTHING
    $SQL$,
    p_table
  );

  EXECUTE sql USING p_entries;
  GET DIAGNOSTICS inserted_rows = ROW_COUNT;
  RAISE NOTICE 'Seeded catalogs.% (% rows inserted)', p_table, inserted_rows;
END
$$;

-- ============================================================
-- Existing catalogs with table-specific schemas
-- ============================================================
DO $$
DECLARE
  v_count int := 0;
  v_inserted int := 0;
BEGIN
  -- accounts (global, non-company table)
  SELECT COUNT(*)::int INTO v_count FROM catalogs.accounts;
  IF v_count < 25 THEN
    INSERT INTO catalogs.accounts (account_number, account_name, account_type, account_subtype, is_postable, currency_code, notes)
    VALUES
      ('1000', 'Cash - Operating', 'Asset', 'Bank', true, 'USD', 'Generic seeded account'),
      ('1100', 'Accounts Receivable', 'Asset', 'AccountsReceivable', true, 'USD', 'Generic seeded account'),
      ('2000', 'Accounts Payable', 'Liability', 'AccountsPayable', true, 'USD', 'Generic seeded account'),
      ('4100', 'Freight Revenue', 'Income', 'SalesOfProductIncome', true, 'USD', 'Generic seeded account'),
      ('6100', 'Fuel Expense', 'Expense', 'FuelCosts', true, 'USD', 'Generic seeded account')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RAISE NOTICE 'Seeded catalogs.accounts (% rows inserted)', v_inserted;
  ELSE
    RAISE NOTICE 'Skipped catalogs.accounts (already has % rows)', v_count;
  END IF;

  -- classes (global)
  SELECT COUNT(*)::int INTO v_count FROM catalogs.classes;
  IF v_count < 25 THEN
    INSERT INTO catalogs.classes (class_name, class_code, notes)
    VALUES
      ('Operations - General', 'OPS', 'Generic seeded class'),
      ('Long Haul', 'LH', 'Generic seeded class'),
      ('Regional', 'REG', 'Generic seeded class'),
      ('Mexico Cross Border', 'MX', 'Generic seeded class'),
      ('Maintenance', 'MNT', 'Generic seeded class')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RAISE NOTICE 'Seeded catalogs.classes (% rows inserted)', v_inserted;
  ELSE
    RAISE NOTICE 'Skipped catalogs.classes (already has % rows)', v_count;
  END IF;

  -- payment terms (global)
  SELECT COUNT(*)::int INTO v_count FROM catalogs.payment_terms;
  IF v_count < 25 THEN
    INSERT INTO catalogs.payment_terms (terms_name, days_until_due, notes)
    VALUES
      ('Net 7', 7, 'Generic seeded terms'),
      ('Net 15', 15, 'Generic seeded terms'),
      ('Net 30', 30, 'Generic seeded terms'),
      ('Net 45', 45, 'Generic seeded terms'),
      ('Due on Receipt', 0, 'Generic seeded terms')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RAISE NOTICE 'Seeded catalogs.payment_terms (% rows inserted)', v_inserted;
  ELSE
    RAISE NOTICE 'Skipped catalogs.payment_terms (already has % rows)', v_count;
  END IF;

  -- items (global)
  SELECT COUNT(*)::int INTO v_count FROM catalogs.items;
  IF v_count < 25 THEN
    INSERT INTO catalogs.items (item_name, item_code, item_type, description, unit_price_cents, taxable, notes)
    VALUES
      ('Linehaul Service', 'LINEHAUL', 'Service', 'Generic linehaul service', 100000, false, 'Generic seeded item'),
      ('Fuel Surcharge', 'FSC', 'Service', 'Generic fuel surcharge', 15000, false, 'Generic seeded item'),
      ('Detention Charge', 'DETENTION', 'Service', 'Generic detention charge', 10000, false, 'Generic seeded item'),
      ('Lumper Charge', 'LUMPER', 'Service', 'Generic lumper charge', 8500, false, 'Generic seeded item'),
      ('Layover Charge', 'LAYOVER', 'Service', 'Generic layover charge', 12000, false, 'Generic seeded item')
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RAISE NOTICE 'Seeded catalogs.items (% rows inserted)', v_inserted;
  ELSE
    RAISE NOTICE 'Skipped catalogs.items (already has % rows)', v_count;
  END IF;

  -- equipment_types (global)
  SELECT COUNT(*)::int INTO v_count FROM catalogs.equipment_types;
  IF v_count < 5 THEN
    INSERT INTO catalogs.equipment_types (code, name, description, is_active, sort_order)
    VALUES
      ('DRY-VAN', 'Dry Van', 'Generic seeded equipment type', true, 10),
      ('REEFER', 'Reefer', 'Generic seeded equipment type', true, 20),
      ('FLATBED', 'Flatbed', 'Generic seeded equipment type', true, 30),
      ('PNEUMATIC', 'Pneumatic', 'Generic seeded equipment type', true, 40),
      ('OVERSIZE', 'Oversize', 'Generic seeded equipment type', true, 50)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RAISE NOTICE 'Seeded catalogs.equipment_types (% rows inserted)', v_inserted;
  ELSE
    RAISE NOTICE 'Skipped catalogs.equipment_types (already has % rows)', v_count;
  END IF;
END
$$;

-- ============================================================
-- SAFETY CATALOGS
-- ============================================================
SELECT catalogs.__seed_company_catalog(
  'civil_fine_types',
  jsonb_build_array(
    jsonb_build_object('code', 'DOT', 'display_name', 'DOT Fine', 'description', 'Generic DOT fine', 'metadata', jsonb_build_object('fine_amount_cents', 10000), 'sort_order', 10),
    jsonb_build_object('code', 'PERMIT', 'display_name', 'Permit Fine', 'description', 'Generic permit fine', 'metadata', jsonb_build_object('fine_amount_cents', 8000), 'sort_order', 20),
    jsonb_build_object('code', 'TOLL', 'display_name', 'Toll Fine', 'description', 'Generic toll fine', 'metadata', jsonb_build_object('fine_amount_cents', 6000), 'sort_order', 30),
    jsonb_build_object('code', 'SPEEDING', 'display_name', 'Speeding Fine', 'description', 'Generic speeding fine', 'metadata', jsonb_build_object('fine_amount_cents', 12000), 'sort_order', 40),
    jsonb_build_object('code', 'EQUIPMENT', 'display_name', 'Equipment Fine', 'description', 'Generic equipment fine', 'metadata', jsonb_build_object('fine_amount_cents', 9000), 'sort_order', 50)
  )
);

DO $$
DECLARE
  v_count int := 0;
  v_inserted int := 0;
BEGIN
  -- internal_fine_reasons (existing schema)
  SELECT COUNT(*)::int INTO v_count FROM catalogs.internal_fine_reasons;
  IF v_count < 15 THEN
    WITH cos AS (
      SELECT id FROM org.companies WHERE deactivated_at IS NULL
    )
    INSERT INTO catalogs.internal_fine_reasons
      (operating_company_id, reason_code, reason_name, default_amount, is_active)
    SELECT cos.id, x.reason_code, x.reason_name, x.default_amount, true
    FROM cos
    CROSS JOIN (VALUES
      ('LATE-DELIVERY', 'Late delivery', 50.00::numeric),
      ('CLEANLINESS', 'Cleanliness issue', 25.00::numeric),
      ('MISSED-BOL', 'Missing BOL/documents', 25.00::numeric),
      ('MISSED-APPT', 'Missed appointment', 100.00::numeric),
      ('GOVERNOR-OVERRIDE', 'Governor override', 150.00::numeric)
    ) AS x(reason_code, reason_name, default_amount)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RAISE NOTICE 'Seeded catalogs.internal_fine_reasons (% rows inserted)', v_inserted;
  ELSE
    RAISE NOTICE 'Skipped catalogs.internal_fine_reasons (already has % rows)', v_count;
  END IF;

  -- company_violation_types (existing schema)
  SELECT COUNT(*)::int INTO v_count FROM catalogs.company_violation_types;
  IF v_count < 15 THEN
    WITH cos AS (
      SELECT id FROM org.companies WHERE deactivated_at IS NULL
    )
    INSERT INTO catalogs.company_violation_types
      (operating_company_id, type_code, type_name, default_severity, is_active)
    SELECT cos.id, x.type_code, x.type_name, x.default_severity::smallint, true
    FROM cos
    CROSS JOIN (VALUES
      ('DRIVE-WITHOUT-PERMISSION', 'Drive without permission', 8),
      ('PERSONAL-USE-NO-AUTH', 'Personal use without authorization', 6),
      ('UNAUTH-PASSENGER', 'Unauthorized passenger', 5),
      ('HOS-POLICY-VIOLATION', 'HOS policy violation', 7),
      ('GOVERNOR-OVERRIDE', 'Governor override', 9)
    ) AS x(type_code, type_name, default_severity)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RAISE NOTICE 'Seeded catalogs.company_violation_types (% rows inserted)', v_inserted;
  ELSE
    RAISE NOTICE 'Skipped catalogs.company_violation_types (already has % rows)', v_count;
  END IF;

  -- complaint_types (existing schema)
  SELECT COUNT(*)::int INTO v_count FROM catalogs.complaint_types;
  IF v_count < 15 THEN
    WITH cos AS (
      SELECT id FROM org.companies WHERE deactivated_at IS NULL
    )
    INSERT INTO catalogs.complaint_types
      (operating_company_id, type_code, type_name, default_severity, is_active)
    SELECT cos.id, x.type_code, x.type_name, x.default_severity, true
    FROM cos
    CROSS JOIN (VALUES
      ('WORKPLACE', 'Workplace complaint', 'warning'),
      ('CIVILIAN-ROAD', 'Civilian road complaint', 'warning'),
      ('DRIVER-DRIVER', 'Driver to driver complaint', 'info'),
      ('CUSTOMER', 'Customer complaint', 'warning'),
      ('ANONYMOUS', 'Anonymous complaint', 'info')
    ) AS x(type_code, type_name, default_severity)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RAISE NOTICE 'Seeded catalogs.complaint_types (% rows inserted)', v_inserted;
  ELSE
    RAISE NOTICE 'Skipped catalogs.complaint_types (already has % rows)', v_count;
  END IF;
END
$$;

SELECT catalogs.__seed_company_catalog(
  'accident_types',
  jsonb_build_array(
    jsonb_build_object('code', 'REAR-END', 'display_name', 'Rear-end', 'description', 'Rear-end collision', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'SIDE-SWIPE', 'display_name', 'Side-swipe', 'description', 'Side-swipe incident', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'BACKING', 'display_name', 'Backing', 'description', 'Backing accident', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'ROLLOVER', 'display_name', 'Rollover', 'description', 'Rollover incident', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'ANIMAL', 'display_name', 'Animal strike', 'description', 'Animal strike incident', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'workplace_incident_types',
  jsonb_build_array(
    jsonb_build_object('code', 'SLIP-FALL', 'display_name', 'Slip / Fall', 'description', 'Slip and fall', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'LIFTING-INJURY', 'display_name', 'Lifting injury', 'description', 'Manual lifting injury', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'EQUIPMENT-INJURY', 'display_name', 'Equipment injury', 'description', 'Injury involving equipment', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'NEAR-MISS', 'display_name', 'Near miss', 'description', 'Near miss event', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'EXPOSURE', 'display_name', 'Exposure', 'description', 'Hazardous exposure', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

-- ============================================================
-- DISPATCH CATALOGS
-- ============================================================
SELECT catalogs.__seed_company_catalog(
  'load_types',
  jsonb_build_array(
    jsonb_build_object('code', 'DRY-VAN', 'display_name', 'Dry Van', 'description', 'Dry van loads', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'REEFER', 'display_name', 'Reefer', 'description', 'Refrigerated loads', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'FLATBED', 'display_name', 'Flatbed', 'description', 'Flatbed loads', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'OVERSIZE', 'display_name', 'Oversize', 'description', 'Oversize loads', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'HAZMAT', 'display_name', 'Hazmat', 'description', 'Hazmat loads', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'detention_reasons',
  jsonb_build_array(
    jsonb_build_object('code', 'SHIPPER-LATE', 'display_name', 'Shipper late', 'description', 'Delay at shipper', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'RECEIVER-LATE', 'display_name', 'Receiver late', 'description', 'Delay at receiver', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'NO-DOCK', 'display_name', 'No dock available', 'description', 'No dock available', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'CUSTOMS-DELAY', 'display_name', 'Customs delay', 'description', 'Customs processing delay', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'BAD-WEATHER', 'display_name', 'Bad weather', 'description', 'Weather-related delay', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'lumper_providers',
  jsonb_build_array(
    jsonb_build_object('code', 'LOCAL-LABOR', 'display_name', 'Local labor', 'description', 'Local labor provider', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'CARRIER-AGENT', 'display_name', 'Carrier agent', 'description', 'Carrier-arranged lumper', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'TPS-LUMPER', 'display_name', 'TPS lumper', 'description', 'Third-party lumper', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'SHIPPER-PROVIDED', 'display_name', 'Shipper provided', 'description', 'Shipper provided lumper', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'SELF', 'display_name', 'Self unload', 'description', 'Driver self unload', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'pickup_time_types',
  jsonb_build_array(
    jsonb_build_object('code', 'APPT-FIRM', 'display_name', 'Appointment - firm', 'description', 'Firm appointment', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'APPT-WINDOW', 'display_name', 'Appointment - window', 'description', 'Appointment window', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'FCFS', 'display_name', 'First-come first-served', 'description', 'FCFS pickup', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'DROP-HOOK', 'display_name', 'Drop & Hook', 'description', 'Drop and hook pickup', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'LIVE-LOAD', 'display_name', 'Live load', 'description', 'Live load pickup', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'additional_charges',
  jsonb_build_array(
    jsonb_build_object('code', 'FSC', 'display_name', 'Fuel surcharge', 'description', 'Fuel surcharge', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'DETENTION', 'display_name', 'Detention', 'description', 'Detention charge', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'LAYOVER', 'display_name', 'Layover', 'description', 'Layover charge', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'LUMPER', 'display_name', 'Lumper', 'description', 'Lumper charge', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'TONU', 'display_name', 'TONU', 'description', 'Truck ordered not used', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'mx_customs_brokers',
  jsonb_build_array(
    jsonb_build_object('code', 'BROKER-A', 'display_name', 'Broker A', 'description', 'Generic customs broker', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'BROKER-B', 'display_name', 'Broker B', 'description', 'Generic customs broker', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'BROKER-C', 'display_name', 'Broker C', 'description', 'Generic customs broker', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'BROKER-D', 'display_name', 'Broker D', 'description', 'Generic customs broker', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'BROKER-E', 'display_name', 'Broker E', 'description', 'Generic customs broker', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

-- cancellation_reasons: NOT a generic company catalog — canonical global table is created in 0101_p5_f4_cancellation_reasons.sql (reason_code, reason_label, …).

SELECT catalogs.__seed_company_catalog(
  'load_trailer_equipment',
  jsonb_build_array(
    jsonb_build_object('code', 'STRAPS', 'display_name', 'Straps', 'description', 'Securement straps', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'CHAINS', 'display_name', 'Chains', 'description', 'Securement chains', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'TARPS', 'display_name', 'Tarps', 'description', 'Weather tarps', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'ETRACK', 'display_name', 'E-Track', 'description', 'E-track securement', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'PALLET-JACK', 'display_name', 'Pallet jack', 'description', 'Pallet jack equipment', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

-- ============================================================
-- DRIVER CATALOGS
-- ============================================================
SELECT catalogs.__seed_company_catalog(
  'pay_rate_templates',
  jsonb_build_array(
    jsonb_build_object('code', 'PER-MILE-LOADED', 'display_name', 'Per-mile loaded', 'description', 'Loaded mile rate', 'metadata', jsonb_build_object('rate', 0.55, 'unit', 'mi'), 'sort_order', 10),
    jsonb_build_object('code', 'PER-MILE-ALL', 'display_name', 'Per-mile all miles', 'description', 'All mile rate', 'metadata', jsonb_build_object('rate', 0.45, 'unit', 'mi'), 'sort_order', 20),
    jsonb_build_object('code', 'PERCENT-LINEHAUL', 'display_name', 'Percent linehaul', 'description', 'Percent of linehaul', 'metadata', jsonb_build_object('percent', 28), 'sort_order', 30),
    jsonb_build_object('code', 'PERCENT-GROSS', 'display_name', 'Percent gross', 'description', 'Percent of gross', 'metadata', jsonb_build_object('percent', 24), 'sort_order', 40),
    jsonb_build_object('code', 'HOURLY', 'display_name', 'Hourly', 'description', 'Hourly rate', 'metadata', jsonb_build_object('rate_cents', 2500, 'unit', 'hr'), 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'driver_pay_types',
  jsonb_build_array(
    jsonb_build_object('code', 'LINEHAUL', 'display_name', 'Linehaul', 'description', 'Linehaul pay', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'FSC', 'display_name', 'Fuel surcharge pay', 'description', 'FSC pay', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'DETENTION-PAY', 'display_name', 'Detention pay', 'description', 'Detention compensation', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'LAYOVER', 'display_name', 'Layover pay', 'description', 'Layover compensation', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'BONUS', 'display_name', 'Bonus', 'description', 'Bonus compensation', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'driver_deduction_types',
  jsonb_build_array(
    jsonb_build_object('code', 'ESCROW-TRUCK', 'display_name', 'Escrow truck', 'description', 'Truck escrow deduction', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'ADVANCE-RECOVERY', 'display_name', 'Advance recovery', 'description', 'Recover cash advance', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'INTERNAL-FINE', 'display_name', 'Internal fine', 'description', 'Internal fine deduction', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'EQUIPMENT-DAMAGE', 'display_name', 'Equipment damage', 'description', 'Equipment damage deduction', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'MISC', 'display_name', 'Miscellaneous', 'description', 'Misc deduction', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'escrow_types',
  jsonb_build_array(
    jsonb_build_object('code', 'TRUCK-DEPOSIT', 'display_name', 'Truck deposit', 'description', 'Truck deposit escrow', 'metadata', jsonb_build_object('target_amount_cents', 150000), 'sort_order', 10),
    jsonb_build_object('code', 'TRAILER-DEPOSIT', 'display_name', 'Trailer deposit', 'description', 'Trailer deposit escrow', 'metadata', jsonb_build_object('target_amount_cents', 50000), 'sort_order', 20),
    jsonb_build_object('code', 'FUEL-DEPOSIT', 'display_name', 'Fuel deposit', 'description', 'Fuel reserve escrow', 'metadata', jsonb_build_object('target_amount_cents', 30000), 'sort_order', 30),
    jsonb_build_object('code', 'MAINT-RESERVE', 'display_name', 'Maintenance reserve', 'description', 'Maintenance reserve escrow', 'metadata', jsonb_build_object('target_amount_cents', 20000), 'sort_order', 40),
    jsonb_build_object('code', 'TIRE-RESERVE', 'display_name', 'Tire reserve', 'description', 'Tire reserve escrow', 'metadata', jsonb_build_object('target_amount_cents', 25000), 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'cash_advance_types',
  jsonb_build_array(
    jsonb_build_object('code', 'ROUTE', 'display_name', 'Route advance', 'description', 'Route-related advance', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'FUEL', 'display_name', 'Fuel advance', 'description', 'Fuel cash advance', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'EMERGENCY', 'display_name', 'Emergency advance', 'description', 'Emergency advance', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'EQUIPMENT', 'display_name', 'Equipment advance', 'description', 'Equipment-related advance', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'MEDICAL', 'display_name', 'Medical advance', 'description', 'Medical emergency advance', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'leave_types',
  jsonb_build_array(
    jsonb_build_object('code', 'PTO', 'display_name', 'Paid time off', 'description', 'PTO leave type', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'SICK', 'display_name', 'Sick leave', 'description', 'Sick leave type', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'UNPAID', 'display_name', 'Unpaid leave', 'description', 'Unpaid leave type', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'FMLA', 'display_name', 'FMLA', 'description', 'FMLA leave type', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'BEREAVEMENT', 'display_name', 'Bereavement', 'description', 'Bereavement leave type', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'settlement_templates',
  jsonb_build_array(
    jsonb_build_object('code', 'WEEKLY-FRIDAY', 'display_name', 'Weekly Friday', 'description', 'Weekly settlement on Friday', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'BIWEEKLY-FRIDAY', 'display_name', 'Biweekly Friday', 'description', 'Biweekly settlement', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'MONTHLY', 'display_name', 'Monthly', 'description', 'Monthly settlement', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'ON-DEMAND', 'display_name', 'On-demand', 'description', 'On-demand settlement', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'PROJECT', 'display_name', 'Project-based', 'description', 'Project settlement template', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

-- ============================================================
-- MAINTENANCE CATALOGS
-- ============================================================
SELECT catalogs.__seed_company_catalog(
  'pm_intervals',
  jsonb_build_array(
    jsonb_build_object('code', 'PM-A', 'display_name', 'PM-A', 'description', 'PM-A service interval', 'metadata', jsonb_build_object('miles_interval', 10000), 'sort_order', 10),
    jsonb_build_object('code', 'PM-B', 'display_name', 'PM-B', 'description', 'PM-B service interval', 'metadata', jsonb_build_object('miles_interval', 25000), 'sort_order', 20),
    jsonb_build_object('code', 'PM-C', 'display_name', 'PM-C', 'description', 'PM-C service interval', 'metadata', jsonb_build_object('miles_interval', 75000), 'sort_order', 30),
    jsonb_build_object('code', 'PM-DOT-ANNUAL', 'display_name', 'PM DOT Annual', 'description', 'Annual DOT PM', 'metadata', jsonb_build_object('annual', true), 'sort_order', 40),
    jsonb_build_object('code', 'PM-OIL-ONLY', 'display_name', 'PM Oil Only', 'description', 'Oil only service interval', 'metadata', jsonb_build_object('miles_interval', 5000), 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'repair_locations',
  jsonb_build_array(
    jsonb_build_object('code', 'MAIN-YARD-LAREDO', 'display_name', 'Main Yard Laredo', 'description', 'IH35 main yard', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'EXTERNAL-SHOP', 'display_name', 'External shop', 'description', 'External repair shop', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'ROADSIDE', 'display_name', 'Roadside', 'description', 'Roadside repair', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'DEALER-AUTHORIZED', 'display_name', 'Dealer authorized', 'description', 'Authorized dealer repair', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'MOBILE-MECHANIC', 'display_name', 'Mobile mechanic', 'description', 'Mobile mechanic service', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'truck_parts',
  jsonb_build_array(
    jsonb_build_object('code', 'OIL-FILTER', 'display_name', 'Oil filter', 'description', 'Truck oil filter', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'AIR-FILTER', 'display_name', 'Air filter', 'description', 'Truck air filter', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'FUEL-FILTER', 'display_name', 'Fuel filter', 'description', 'Truck fuel filter', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'BRAKE-PADS', 'display_name', 'Brake pads', 'description', 'Truck brake pads', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'ALTERNATOR', 'display_name', 'Alternator', 'description', 'Truck alternator', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'trailer_parts',
  jsonb_build_array(
    jsonb_build_object('code', 'AIR-BRAKE-CHAMBER', 'display_name', 'Air brake chamber', 'description', 'Trailer air brake chamber', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'KING-PIN', 'display_name', 'King pin', 'description', 'Trailer king pin', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'LANDING-GEAR', 'display_name', 'Landing gear', 'description', 'Trailer landing gear', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'TIRE', 'display_name', 'Trailer tire', 'description', 'Trailer tire', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'DOT-INSPECTION-DECAL', 'display_name', 'DOT inspection decal', 'description', 'DOT decal', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'tire_catalog',
  jsonb_build_array(
    jsonb_build_object('code', 'DRIVE-LP-TIRE', 'display_name', 'Drive LP tire', 'description', 'Low profile drive tire', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'STEER-LP-TIRE', 'display_name', 'Steer LP tire', 'description', 'Low profile steer tire', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'TRAILER-TIRE', 'display_name', 'Trailer tire', 'description', 'Standard trailer tire', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'SUPER-SINGLE', 'display_name', 'Super single', 'description', 'Super single tire', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'RETREAD', 'display_name', 'Retread', 'description', 'Retread tire', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'battery_catalog',
  jsonb_build_array(
    jsonb_build_object('code', 'GROUP-31-MAIN', 'display_name', 'Group 31 Main', 'description', 'Main battery group 31', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'GROUP-31-AUX', 'display_name', 'Group 31 Auxiliary', 'description', 'Aux battery group 31', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'AGM-PREMIUM', 'display_name', 'AGM Premium', 'description', 'AGM premium battery', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'LITHIUM-IRON', 'display_name', 'Lithium iron', 'description', 'Lithium iron battery', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'STD-WET', 'display_name', 'Standard wet', 'description', 'Standard wet-cell battery', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'air_bag_catalog',
  jsonb_build_array(
    jsonb_build_object('code', 'DRIVE-AIRBAG', 'display_name', 'Drive airbag', 'description', 'Drive axle airbag', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'STEER-AIRBAG', 'display_name', 'Steer airbag', 'description', 'Steer axle airbag', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'CAB-AIRBAG', 'display_name', 'Cab airbag', 'description', 'Cab suspension airbag', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'TRAILER-AIRBAG', 'display_name', 'Trailer airbag', 'description', 'Trailer suspension airbag', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'AUX-AIRBAG', 'display_name', 'Auxiliary airbag', 'description', 'Auxiliary airbag', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'work_order_templates',
  jsonb_build_array(
    jsonb_build_object('code', 'PM-A-STANDARD', 'display_name', 'PM-A standard', 'description', 'Standard PM-A checklist', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'PM-B-STANDARD', 'display_name', 'PM-B standard', 'description', 'Standard PM-B checklist', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'BRAKE-INSPECTION', 'display_name', 'Brake inspection', 'description', 'Brake inspection template', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'DOT-ANNUAL', 'display_name', 'DOT annual', 'description', 'Annual DOT inspection template', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'OIL-CHANGE-ONLY', 'display_name', 'Oil change only', 'description', 'Oil change template', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

-- ============================================================
-- FUEL CATALOGS
-- ============================================================
SELECT catalogs.__seed_company_catalog(
  'fuel_stations',
  jsonb_build_array(
    jsonb_build_object('code', 'LOVES', 'display_name', 'Love''s', 'description', 'Love''s travel stops', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'PILOT', 'display_name', 'Pilot', 'description', 'Pilot travel centers', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'TA-PETRO', 'display_name', 'TA Petro', 'description', 'TA Petro travel centers', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'FLYING-J', 'display_name', 'Flying J', 'description', 'Flying J travel centers', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'INDEPENDENT', 'display_name', 'Independent', 'description', 'Independent station', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'fuel_grades',
  jsonb_build_array(
    jsonb_build_object('code', 'ULSD', 'display_name', 'ULSD', 'description', 'Ultra-low sulfur diesel', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'DEF', 'display_name', 'DEF', 'description', 'Diesel exhaust fluid', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'BIODIESEL-B5', 'display_name', 'Biodiesel B5', 'description', 'B5 blend', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'BIODIESEL-B20', 'display_name', 'Biodiesel B20', 'description', 'B20 blend', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'OFF-ROAD-DIESEL', 'display_name', 'Off-road diesel', 'description', 'Off-road diesel', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'toll_providers',
  jsonb_build_array(
    jsonb_build_object('code', 'PREPASS', 'display_name', 'PrePass', 'description', 'PrePass toll provider', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'BESTPASS', 'display_name', 'BestPass', 'description', 'BestPass toll provider', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'EZ-PASS', 'display_name', 'E-ZPass', 'description', 'E-ZPass toll provider', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'SUNPASS', 'display_name', 'SunPass', 'description', 'SunPass toll provider', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'K-TAG', 'display_name', 'K-Tag', 'description', 'K-Tag toll provider', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'expensive_states',
  jsonb_build_array(
    jsonb_build_object('code', 'CA', 'display_name', 'California', 'description', 'High-cost fuel/toll state', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'NY', 'display_name', 'New York', 'description', 'High-cost fuel/toll state', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'IL', 'display_name', 'Illinois', 'description', 'High-cost fuel/toll state', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'OR', 'display_name', 'Oregon', 'description', 'High-cost fuel/toll state', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'WA', 'display_name', 'Washington', 'description', 'High-cost fuel/toll state', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'def_stations',
  jsonb_build_array(
    jsonb_build_object('code', 'LOVES-DEF', 'display_name', 'Love''s DEF', 'description', 'DEF at Love''s', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'PILOT-DEF', 'display_name', 'Pilot DEF', 'description', 'DEF at Pilot', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'TA-PETRO-DEF', 'display_name', 'TA Petro DEF', 'description', 'DEF at TA Petro', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'FLYING-J-DEF', 'display_name', 'Flying J DEF', 'description', 'DEF at Flying J', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'INDEPENDENT-DEF', 'display_name', 'Independent DEF', 'description', 'DEF at independent station', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'relay_accounts',
  jsonb_build_array(
    jsonb_build_object('code', 'RELAY-MAIN', 'display_name', 'Relay Main', 'description', 'Main relay account', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'RELAY-CC-1', 'display_name', 'Relay CC 1', 'description', 'Relay card account 1', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'RELAY-CC-2', 'display_name', 'Relay CC 2', 'description', 'Relay card account 2', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'RELAY-OWNER-OPS', 'display_name', 'Relay Owner Ops', 'description', 'Owner-operator relay account', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'RELAY-FLEET', 'display_name', 'Relay Fleet', 'description', 'Fleet relay account', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_company_catalog(
  'ifta_states',
  jsonb_build_array(
    jsonb_build_object('code', 'TX', 'display_name', 'Texas', 'description', 'IFTA state', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'NM', 'display_name', 'New Mexico', 'description', 'IFTA state', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'AZ', 'display_name', 'Arizona', 'description', 'IFTA state', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'CA', 'display_name', 'California', 'description', 'IFTA state', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'OK', 'display_name', 'Oklahoma', 'description', 'IFTA state', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

-- ============================================================
-- ACCOUNTING CATALOGS
-- ============================================================
SELECT catalogs.__seed_company_catalog(
  'qbo_categories',
  jsonb_build_array(
    jsonb_build_object('code', 'VEHICLE-MAINT', 'display_name', 'Vehicle maintenance', 'description', 'QBO category - vehicle maintenance', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'FUEL', 'display_name', 'Fuel', 'description', 'QBO category - fuel', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'INSURANCE', 'display_name', 'Insurance', 'description', 'QBO category - insurance', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'PROFESSIONAL-FEES', 'display_name', 'Professional fees', 'description', 'QBO category - professional fees', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'OFFICE', 'display_name', 'Office', 'description', 'QBO category - office', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

DROP FUNCTION IF EXISTS catalogs.__seed_company_catalog(text, jsonb);

COMMIT;
