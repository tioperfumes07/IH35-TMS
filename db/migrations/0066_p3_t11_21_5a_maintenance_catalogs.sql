BEGIN;

CREATE SCHEMA IF NOT EXISTS catalogs;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'maintenance_failure_codes',
    'maintenance_labor_codes',
    'maintenance_parts',
    'maintenance_priority_levels',
    'maintenance_service_tasks',
    'maintenance_shop_locations',
    'maintenance_vendors',
    'work_order_statuses'
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
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.%I TO ih35_app', tbl);
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

CREATE OR REPLACE FUNCTION catalogs.__seed_maintenance_catalog(p_table text, p_entries jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
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
END
$$;

SELECT catalogs.__seed_maintenance_catalog(
  'maintenance_failure_codes',
  jsonb_build_array(
    jsonb_build_object('code', 'BRAKE-LOW-PRESSURE', 'display_name', 'Brake low pressure', 'description', 'Brake air pressure below threshold', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'ELECTRICAL-SHORT', 'display_name', 'Electrical short', 'description', 'Electrical short circuit detected', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'ABS-FAULT', 'display_name', 'ABS fault', 'description', 'ABS warning or sensor failure', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'AIR-LEAK', 'display_name', 'Air leak', 'description', 'Air system leak requiring repair', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'TIRE-IRREGULAR-WEAR', 'display_name', 'Tire irregular wear', 'description', 'Uneven tire wear pattern detected', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_maintenance_catalog(
  'maintenance_labor_codes',
  jsonb_build_array(
    jsonb_build_object('code', 'INSPECTION', 'display_name', 'Inspection', 'description', 'General inspection labor', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'PM-SERVICE', 'display_name', 'PM service', 'description', 'Preventive maintenance service labor', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'BRAKE-REPAIR', 'display_name', 'Brake repair', 'description', 'Brake service and repair labor', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'ELECTRICAL-REPAIR', 'display_name', 'Electrical repair', 'description', 'Electrical diagnostic and repair labor', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'ROAD-CALL', 'display_name', 'Road call', 'description', 'Emergency roadside service labor', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_maintenance_catalog(
  'maintenance_parts',
  jsonb_build_array(
    jsonb_build_object('code', 'OIL-FILTER', 'display_name', 'Oil filter', 'description', 'Engine oil filter assembly', 'metadata', jsonb_build_object('part_number', 'OF-001', 'manufacturer', 'Generic', 'qbo_item_id', null), 'sort_order', 10),
    jsonb_build_object('code', 'FUEL-FILTER', 'display_name', 'Fuel filter', 'description', 'Primary fuel filter cartridge', 'metadata', jsonb_build_object('part_number', 'FF-120', 'manufacturer', 'FleetPro', 'qbo_item_id', null), 'sort_order', 20),
    jsonb_build_object('code', 'BRAKE-PAD-SET', 'display_name', 'Brake pad set', 'description', 'Axle brake pad replacement set', 'metadata', jsonb_build_object('part_number', 'BP-442', 'manufacturer', 'RoadMax', 'qbo_item_id', null), 'sort_order', 30),
    jsonb_build_object('code', 'AIR-DRYER', 'display_name', 'Air dryer', 'description', 'Air dryer cartridge kit', 'metadata', jsonb_build_object('part_number', 'AD-231', 'manufacturer', 'Wabco', 'qbo_item_id', null), 'sort_order', 40),
    jsonb_build_object('code', 'COOLANT-HOSE', 'display_name', 'Coolant hose', 'description', 'Engine coolant hose segment', 'metadata', jsonb_build_object('part_number', 'CH-090', 'manufacturer', 'TruFlow', 'qbo_item_id', null), 'sort_order', 50)
  )
);

SELECT catalogs.__seed_maintenance_catalog(
  'maintenance_priority_levels',
  jsonb_build_array(
    jsonb_build_object('code', 'P1-CRITICAL', 'display_name', 'P1 Critical', 'description', 'Unsafe to operate, immediate action required', 'metadata', jsonb_build_object('priority', 1), 'sort_order', 10),
    jsonb_build_object('code', 'P2-HIGH', 'display_name', 'P2 High', 'description', 'Major defect, schedule as soon as possible', 'metadata', jsonb_build_object('priority', 2), 'sort_order', 20),
    jsonb_build_object('code', 'P3-MEDIUM', 'display_name', 'P3 Medium', 'description', 'Operational but needs timely repair', 'metadata', jsonb_build_object('priority', 3), 'sort_order', 30),
    jsonb_build_object('code', 'P4-LOW', 'display_name', 'P4 Low', 'description', 'Minor issue, schedule with next service', 'metadata', jsonb_build_object('priority', 4), 'sort_order', 40),
    jsonb_build_object('code', 'P5-PLANNED', 'display_name', 'P5 Planned', 'description', 'Planned maintenance or optimization', 'metadata', jsonb_build_object('priority', 5), 'sort_order', 50)
  )
);

SELECT catalogs.__seed_maintenance_catalog(
  'maintenance_service_tasks',
  jsonb_build_array(
    jsonb_build_object('code', 'PM-A-CHECKLIST', 'display_name', 'PM-A checklist', 'description', 'Basic PM-A checklist service task', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'PM-B-CHECKLIST', 'display_name', 'PM-B checklist', 'description', 'Advanced PM-B checklist service task', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'DOT-INSPECTION', 'display_name', 'DOT inspection', 'description', 'Annual DOT inspection workflow', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'BRAKE-ADJUSTMENT', 'display_name', 'Brake adjustment', 'description', 'Brake adjustment and verification task', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'TIRE-ROTATION', 'display_name', 'Tire rotation', 'description', 'Tire rotation and balancing task', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_maintenance_catalog(
  'maintenance_shop_locations',
  jsonb_build_array(
    jsonb_build_object('code', 'LAREDO-MAIN-SHOP', 'display_name', 'Laredo main shop', 'description', 'Primary in-house maintenance facility', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'SAN-ANTONIO-YARD', 'display_name', 'San Antonio yard', 'description', 'Regional yard maintenance bay', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'HOUSTON-SATELLITE', 'display_name', 'Houston satellite', 'description', 'Satellite maintenance location', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'ROADSIDE-NETWORK', 'display_name', 'Roadside network', 'description', 'Approved roadside partner network', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'VENDOR-SHOP', 'display_name', 'Vendor shop', 'description', 'External vendor shop location', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_maintenance_catalog(
  'maintenance_vendors',
  jsonb_build_array(
    jsonb_build_object('code', 'GOODYEAR-COMMERCIAL', 'display_name', 'Goodyear Commercial', 'description', 'Preferred tire and service vendor', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'FLEETPRIDE', 'display_name', 'FleetPride', 'description', 'Parts and heavy-duty vendor', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'LOVE-TRUCK-CARE', 'display_name', 'Love Truck Care', 'description', 'Roadside and shop repair vendor', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'TA-SERVICE', 'display_name', 'TA Service', 'description', 'Travel center repair network', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'INDEPENDENT-SHOP', 'display_name', 'Independent shop', 'description', 'Local independent maintenance provider', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

SELECT catalogs.__seed_maintenance_catalog(
  'work_order_statuses',
  jsonb_build_array(
    jsonb_build_object('code', 'OPEN', 'display_name', 'Open', 'description', 'Work order created and pending', 'metadata', '{}'::jsonb, 'sort_order', 10),
    jsonb_build_object('code', 'IN-TRIAGE', 'display_name', 'In triage', 'description', 'Work order under initial review', 'metadata', '{}'::jsonb, 'sort_order', 20),
    jsonb_build_object('code', 'IN-PROGRESS', 'display_name', 'In progress', 'description', 'Repair work underway', 'metadata', '{}'::jsonb, 'sort_order', 30),
    jsonb_build_object('code', 'ON-HOLD', 'display_name', 'On hold', 'description', 'Awaiting parts/approval/resources', 'metadata', '{}'::jsonb, 'sort_order', 40),
    jsonb_build_object('code', 'COMPLETE', 'display_name', 'Complete', 'description', 'Repair completed and closed', 'metadata', '{}'::jsonb, 'sort_order', 50)
  )
);

DROP FUNCTION IF EXISTS catalogs.__seed_maintenance_catalog(text, jsonb);

COMMIT;
