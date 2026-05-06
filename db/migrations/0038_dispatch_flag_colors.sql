BEGIN;

CREATE TABLE IF NOT EXISTS catalogs.dispatch_flag_colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  flag_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  hex_color TEXT NOT NULL,
  icon_emoji TEXT,
  severity_order INT NOT NULL DEFAULT 50,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID NOT NULL REFERENCES identity.users(id),
  UNIQUE (operating_company_id, flag_code),
  CONSTRAINT chk_flag_severity CHECK (severity_order BETWEEN 0 AND 100),
  CONSTRAINT chk_flag_hex_format CHECK (hex_color ~ '^#[0-9a-fA-F]{6}$')
);

CREATE INDEX IF NOT EXISTS idx_dispatch_flags_company_active
  ON catalogs.dispatch_flag_colors (operating_company_id, is_active, sort_order);

ALTER TABLE catalogs.dispatch_flag_colors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dispatch_flags_select ON catalogs.dispatch_flag_colors;
CREATE POLICY dispatch_flags_select ON catalogs.dispatch_flag_colors
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id IN (
      SELECT company_id
      FROM org.user_company_access
      WHERE user_id = identity.current_user_id()
        AND deactivated_at IS NULL
    )
  );

DROP POLICY IF EXISTS dispatch_flags_insert ON catalogs.dispatch_flag_colors;
CREATE POLICY dispatch_flags_insert ON catalogs.dispatch_flag_colors
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR identity.current_user_role() = ANY (
      ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum]
    )
  );

DROP POLICY IF EXISTS dispatch_flags_update ON catalogs.dispatch_flag_colors;
CREATE POLICY dispatch_flags_update ON catalogs.dispatch_flag_colors
  FOR UPDATE TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR identity.current_user_role() = ANY (
      ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum]
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR identity.current_user_role() = ANY (
      ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum]
    )
  );

GRANT USAGE ON SCHEMA catalogs TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON catalogs.dispatch_flag_colors TO ih35_app;

DROP TRIGGER IF EXISTS trg_dispatch_flags_updated_at ON catalogs.dispatch_flag_colors;
CREATE TRIGGER trg_dispatch_flags_updated_at
  BEFORE UPDATE ON catalogs.dispatch_flag_colors
  FOR EACH ROW EXECUTE FUNCTION mdata.set_updated_at();

WITH owner_user AS (
  SELECT id
  FROM identity.users
  WHERE role = 'Owner'
  ORDER BY created_at
  LIMIT 1
),
seed(flag_code, display_name, hex_color, icon_emoji, severity_order, description, sort_order) AS (
  VALUES
    ('GRAY', 'Pending Assignment', '#9ca3af', '⚪', 5, 'Load entered but not yet assigned to unit/driver', 10),
    ('GREEN', 'On Schedule', '#10b981', '🟢', 10, 'Load proceeding on schedule, no issues', 20),
    ('BLUE', 'Completed', '#3b82f6', '🔵', 15, 'Delivered, awaiting paperwork or invoicing', 30),
    ('YELLOW', 'At Risk', '#eab308', '🟡', 50, 'Risk factors: tight appointment, weather, traffic', 40),
    ('ORANGE', 'Needs Attention', '#f97316', '🟠', 65, 'Driver missed check-in or late departure', 50),
    ('RED', 'Late / Critical', '#ef4444', '🔴', 90, 'Missed appointment, accident, breakdown, or critical', 60),
    ('PURPLE', 'Special Handling', '#a855f7', '🟣', 40, 'Hazmat, oversized, refrigerated, or security escort', 70),
    ('BLACK', 'Cancelled', '#1f2937', '⚫', 100, 'Load cancelled — see cancellation reason', 80)
)
INSERT INTO catalogs.dispatch_flag_colors (
  operating_company_id,
  flag_code,
  display_name,
  hex_color,
  icon_emoji,
  severity_order,
  description,
  sort_order,
  created_by_user_id
)
SELECT
  c.id,
  s.flag_code,
  s.display_name,
  s.hex_color,
  s.icon_emoji,
  s.severity_order,
  s.description,
  s.sort_order,
  o.id
FROM org.companies c
CROSS JOIN seed s
CROSS JOIN owner_user o
WHERE c.deactivated_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM catalogs.dispatch_flag_colors existing
    WHERE existing.operating_company_id = c.id
      AND existing.flag_code = s.flag_code
  );

COMMIT;
