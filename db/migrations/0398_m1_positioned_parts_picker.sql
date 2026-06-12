-- M1: Positioned-Parts Picker
-- Adds position_set catalog and part_position_assignment tables with RLS

-- Ensure schema exists
CREATE SCHEMA IF NOT EXISTS maint;

-- 1. Add position_set columns to maint.part (idempotent)
DO $$
DECLARE
  table_exists boolean;
  col_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'maint' AND table_name = 'part'
  ) INTO table_exists;
  
  IF table_exists THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'maint' AND table_name = 'part' AND column_name = 'position_set_id'
    ) INTO col_exists;
    IF NOT col_exists THEN
      ALTER TABLE maint.part ADD COLUMN position_set_id uuid;
    END IF;
    
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'maint' AND table_name = 'part' AND column_name = 'requires_position'
    ) INTO col_exists;
    IF NOT col_exists THEN
      ALTER TABLE maint.part ADD COLUMN requires_position boolean NOT NULL DEFAULT false;
    END IF;
  END IF;
END $$;

-- 2. Create maint.position_set table (idempotent)
CREATE TABLE IF NOT EXISTS maint.position_set (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL,
  code varchar(100) NOT NULL,
  display_name varchar(200) NOT NULL,
  description text,
  part_type_hint varchar(100),
  vehicle_make varchar(100),
  vehicle_model varchar(100),
  positions jsonb NOT NULL DEFAULT '[]'::jsonb,
  map_view varchar(50) NOT NULL DEFAULT 'top',
  map_svg_config jsonb DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT position_set_code_company_unique UNIQUE (operating_company_id, code)
);

COMMENT ON COLUMN maint.position_set.positions IS 'Array of position objects: [{code, name, group, side, x, y, view_context}]';
COMMENT ON COLUMN maint.position_set.map_view IS 'Default view context: top (axle view), front, rear, side, battery-bank';

-- 3. Create maint.part_position_assignment table (idempotent)
CREATE TABLE IF NOT EXISTS maint.part_position_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL,
  part_uuid uuid NOT NULL,
  position_set_id uuid NOT NULL REFERENCES maint.position_set(id) ON DELETE CASCADE,
  position_overrides jsonb DEFAULT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_position_assignment_unique UNIQUE (part_uuid, position_set_id)
);

-- 4. Enable RLS on all new tables
ALTER TABLE maint.position_set ENABLE ROW LEVEL SECURITY;
ALTER TABLE maint.part_position_assignment ENABLE ROW LEVEL SECURITY;

-- 5. Force RLS for all roles
ALTER TABLE maint.position_set FORCE ROW LEVEL SECURITY;
ALTER TABLE maint.part_position_assignment FORCE ROW LEVEL SECURITY;

-- 6. Create tenant isolation policies (guarded DO blocks per D1 pattern)
DO $$
DECLARE
  policy_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'maint' 
      AND tablename = 'position_set' 
      AND policyname = 'position_set_tenant_isolation'
  ) INTO policy_exists;
  IF NOT policy_exists THEN
    CREATE POLICY position_set_tenant_isolation
      ON maint.position_set
      FOR ALL
      TO ih35_app
      USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
  END IF;
END $$;

DO $$
DECLARE
  policy_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'maint' 
      AND tablename = 'part_position_assignment' 
      AND policyname = 'part_position_assignment_tenant_isolation'
  ) INTO policy_exists;
  IF NOT policy_exists THEN
    CREATE POLICY part_position_assignment_tenant_isolation
      ON maint.part_position_assignment
      FOR ALL
      TO ih35_app
      USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
  END IF;
END $$;

-- 7. Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION maint.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Add triggers for updated_at (drop and recreate)
DROP TRIGGER IF EXISTS position_set_updated_at ON maint.position_set;
CREATE TRIGGER position_set_updated_at
  BEFORE UPDATE ON maint.position_set
  FOR EACH ROW EXECUTE FUNCTION maint.set_updated_at();

DROP TRIGGER IF EXISTS part_position_assignment_updated_at ON maint.part_position_assignment;
CREATE TRIGGER part_position_assignment_updated_at
  BEFORE UPDATE ON maint.part_position_assignment
  FOR EACH ROW EXECUTE FUNCTION maint.set_updated_at();

-- 9. Seed default position sets (only if none exist for the system company)
INSERT INTO maint.position_set (
  operating_company_id, code, display_name, description, 
  part_type_hint, vehicle_make, vehicle_model, map_view, positions, sort_order
)
SELECT 
  '00000000-0000-0000-0000-000000000000'::uuid,
  code, display_name, description, part_type_hint, 
  vehicle_make, vehicle_model, map_view, positions::jsonb, sort_order
FROM (VALUES
  (
    'truck-tires-standard',
    'Standard Truck Tire Positions (18-wheeler)',
    'Front steer axle (2) + Drive axles (8) + Trailer axles (8) positions',
    'tire',
    NULL,
    NULL,
    'top',
    '[{"code":"FS-L","name":"Front Steer Left","group":"Front Axle","side":"left","x":45,"y":20},{"code":"FS-R","name":"Front Steer Right","group":"Front Axle","side":"right","x":55,"y":20},{"code":"D1-OL","name":"Drive 1 Outer Left","group":"Drive Axle 1","side":"left","x":35,"y":45},{"code":"D1-IL","name":"Drive 1 Inner Left","group":"Drive Axle 1","side":"left","x":40,"y":45},{"code":"D1-IR","name":"Drive 1 Inner Right","group":"Drive Axle 1","side":"right","x":60,"y":45},{"code":"D1-OR","name":"Drive 1 Outer Right","group":"Drive Axle 1","side":"right","x":65,"y":45},{"code":"D2-OL","name":"Drive 2 Outer Left","group":"Drive Axle 2","side":"left","x":35,"y":60},{"code":"D2-IL","name":"Drive 2 Inner Left","group":"Drive Axle 2","side":"left","x":40,"y":60},{"code":"D2-IR","name":"Drive 2 Inner Right","group":"Drive Axle 2","side":"right","x":60,"y":60},{"code":"D2-OR","name":"Drive 2 Outer Right","group":"Drive Axle 2","side":"right","x":65,"y":60},{"code":"T1-OL","name":"Trailer 1 Outer Left","group":"Trailer Axle 1","side":"left","x":35,"y":75},{"code":"T1-IL","name":"Trailer 1 Inner Left","group":"Trailer Axle 1","side":"left","x":40,"y":75},{"code":"T1-IR","name":"Trailer 1 Inner Right","group":"Trailer Axle 1","side":"right","x":60,"y":75},{"code":"T1-OR","name":"Trailer 1 Outer Right","group":"Trailer Axle 1","side":"right","x":65,"y":75},{"code":"T2-OL","name":"Trailer 2 Outer Left","group":"Trailer Axle 2","side":"left","x":35,"y":85},{"code":"T2-IL","name":"Trailer 2 Inner Left","group":"Trailer Axle 2","side":"left","x":40,"y":85},{"code":"T2-IR","name":"Trailer 2 Inner Right","group":"Trailer Axle 2","side":"right","x":60,"y":85},{"code":"T2-OR","name":"Trailer 2 Outer Right","group":"Trailer Axle 2","side":"right","x":65,"y":85}]'::text,
    1
  ),
  (
    'trailer-tires-standard',
    'Standard Trailer Tire Positions',
    'Trailer axle tire positions for standard 53ft trailers',
    'tire',
    NULL,
    '53ft Trailer',
    'top',
    '[{"code":"T1-OL","name":"Trailer Axle 1 Outer Left","group":"Axle 1","side":"left","x":30,"y":40},{"code":"T1-IL","name":"Trailer Axle 1 Inner Left","group":"Axle 1","side":"left","x":35,"y":40},{"code":"T1-IR","name":"Trailer Axle 1 Inner Right","group":"Axle 1","side":"right","x":65,"y":40},{"code":"T1-OR","name":"Trailer Axle 1 Outer Right","group":"Axle 1","side":"right","x":70,"y":40},{"code":"T2-OL","name":"Trailer Axle 2 Outer Left","group":"Axle 2","side":"left","x":30,"y":60},{"code":"T2-IL","name":"Trailer Axle 2 Inner Left","group":"Axle 2","side":"left","x":35,"y":60},{"code":"T2-IR","name":"Trailer Axle 2 Inner Right","group":"Axle 2","side":"right","x":65,"y":60},{"code":"T2-OR","name":"Trailer Axle 2 Outer Right","group":"Axle 2","side":"right","x":70,"y":60},{"code":"T3-OL","name":"Trailer Axle 3 Outer Left","group":"Axle 3","side":"left","x":30,"y":80},{"code":"T3-IL","name":"Trailer Axle 3 Inner Left","group":"Axle 3","side":"left","x":35,"y":80},{"code":"T3-IR","name":"Trailer Axle 3 Inner Right","group":"Axle 3","side":"right","x":65,"y":80},{"code":"T3-OR","name":"Trailer Axle 3 Outer Right","group":"Axle 3","side":"right","x":70,"y":80}]'::text,
    2
  ),
  (
    'truck-front-view',
    'Truck Front View Positions',
    'Headlamps, turn signals, mirrors, and front-facing parts',
    'lamp',
    NULL,
    NULL,
    'front',
    '[{"code":"HL-L","name":"Headlamp Left","group":"Lighting","side":"left","x":25,"y":50},{"code":"HL-R","name":"Headlamp Right","group":"Lighting","side":"right","x":75,"y":50},{"code":"TS-L","name":"Turn Signal Left","group":"Lighting","side":"left","x":20,"y":45},{"code":"TS-R","name":"Turn Signal Right","group":"Lighting","side":"right","x":80,"y":45},{"code":"MR-L","name":"Mirror Left","group":"Mirrors","side":"left","x":15,"y":35},{"code":"MR-R","name":"Mirror Right","group":"Mirrors","side":"right","x":85,"y":35},{"code":"FB-C","name":"Front Bumper Center","group":"Bumper","side":"center","x":50,"y":85},{"code":"FG-L","name":"Front Grill Left","group":"Grill","side":"left","x":35,"y":65},{"code":"FG-R","name":"Front Grill Right","group":"Grill","side":"right","x":65,"y":65}]'::text,
    3
  ),
  (
    'truck-rear-view',
    'Truck Rear View Positions',
    'Tail lamps, brake lights, and rear-facing parts',
    'lamp',
    NULL,
    NULL,
    'rear',
    '[{"code":"TL-L","name":"Tail Lamp Left","group":"Lighting","side":"left","x":25,"y":50},{"code":"TL-R","name":"Tail Lamp Right","group":"Lighting","side":"right","x":75,"y":50},{"code":"BL-L","name":"Brake Light Left","group":"Lighting","side":"left","x":25,"y":35},{"code":"BL-R","name":"Brake Light Right","group":"Lighting","side":"right","x":75,"y":35},{"code":"RB-C","name":"Rear Bumper Center","group":"Bumper","side":"center","x":50,"y":85},{"code":"DM-L","name":"DOT Marker Left","group":"Markers","side":"left","x":20,"y":20},{"code":"DM-R","name":"DOT Marker Right","group":"Markers","side":"right","x":80,"y":20},{"code":"PL-L","name":"Plate Light Left","group":"License","side":"left","x":45,"y":75},{"code":"PL-R","name":"Plate Light Right","group":"License","side":"right","x":55,"y":75}]'::text,
    4
  ),
  (
    'truck-battery-bank',
    'Truck Battery Bank Positions',
    'Battery compartments and connections',
    'battery',
    NULL,
    NULL,
    'battery-bank',
    '[{"code":"B1-L","name":"Battery 1 Left","group":"Battery Bank","side":"left","x":20,"y":30},{"code":"B1-R","name":"Battery 1 Right","group":"Battery Bank","side":"right","x":80,"y":30},{"code":"B2-L","name":"Battery 2 Left","group":"Battery Bank","side":"left","x":20,"y":50},{"code":"B2-R","name":"Battery 2 Right","group":"Battery Bank","side":"right","x":80,"y":50},{"code":"B3-L","name":"Battery 3 Left","group":"Battery Bank","side":"left","x":20,"y":70},{"code":"B3-R","name":"Battery 3 Right","group":"Battery Bank","side":"right","x":80,"y":70},{"code":"BC-C","name":"Battery Connection Center","group":"Connections","side":"center","x":50,"y":50}]'::text,
    5
  ),
  (
    'trailer-rear-view',
    'Trailer Rear View Positions',
    'Trailer tail lamps, markers, and rear doors',
    'lamp',
    NULL,
    '53ft Trailer',
    'rear',
    '[{"code":"TT-L","name":"Trailer Tail Left","group":"Lighting","side":"left","x":20,"y":40},{"code":"TT-R","name":"Trailer Tail Right","group":"Lighting","side":"right","x":80,"y":40},{"code":"TB-L","name":"Trailer Brake Left","group":"Lighting","side":"left","x":20,"y":30},{"code":"TB-R","name":"Trailer Brake Right","group":"Lighting","side":"right","x":80,"y":30},{"code":"TM-L","name":"Trailer Marker Left","group":"Markers","side":"left","x":15,"y":20},{"code":"TM-R","name":"Trailer Marker Right","group":"Markers","side":"right","x":85,"y":20},{"code":"TD-L","name":"Trailer Door Left","group":"Doors","side":"left","x":35,"y":60},{"code":"TD-R","name":"Trailer Door Right","group":"Doors","side":"right","x":65,"y":60}]'::text,
    6
  )
) AS v(code, display_name, description, part_type_hint, vehicle_make, vehicle_model, map_view, positions, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM maint.position_set 
  WHERE operating_company_id = '00000000-0000-0000-0000-000000000000'::uuid
    AND code = v.code
);

-- 10. Grants for ih35_app role
GRANT SELECT, INSERT, UPDATE, DELETE ON maint.position_set TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON maint.part_position_assignment TO ih35_app;

-- 11. Grants for authenticated role if exists
DO $$
DECLARE
  role_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') INTO role_exists;
  IF role_exists THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON maint.position_set TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON maint.part_position_assignment TO authenticated;
  END IF;
END $$;

-- 12. Grants for service_role if exists
DO $$
DECLARE
  role_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') INTO role_exists;
  IF role_exists THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON maint.position_set TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON maint.part_position_assignment TO service_role;
  END IF;
END $$;
