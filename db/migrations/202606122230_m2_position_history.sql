-- M2: Position History for Integrity/Positioned-Parts
-- Tracks history of every positioned-part assignment over time

BEGIN;

-- Position history table: immutable facts about part installations/removals
CREATE TABLE IF NOT EXISTS maint.position_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
    
    -- Equipment/unit reference
    unit_id uuid NOT NULL REFERENCES mdata.units(id) ON DELETE CASCADE,
    unit_type text NOT NULL CHECK (unit_type IN ('truck', 'trailer', 'reefer')),
    
    -- Position reference (from M1's position_set system)
    position_set_id uuid NOT NULL REFERENCES maint.position_set(id) ON DELETE CASCADE,
    position_code text NOT NULL,
    
    -- Part reference
    part_id uuid REFERENCES maint.part(id) ON DELETE SET NULL,
    part_number text, -- denormalized for history preservation
    
    -- Action tracking
    action text NOT NULL CHECK (action IN ('installed', 'removed', 'replaced')),
    action_reason text, -- optional: why this action occurred
    
    -- Actor (who performed the action)
    actor_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    actor_name text, -- denormalized for audit trail
    
    -- Timestamp
    action_at timestamptz NOT NULL DEFAULT now(),
    
    -- Source reference (e.g., work order that triggered this)
    source_type text CHECK (source_type IN ('work_order', 'manual_entry', 'bulk_import')),
    source_id uuid,
    
    -- Metadata
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    
    -- Ensure position_code is valid for the position_set (enforced via app logic)
    CONSTRAINT position_history_position_check CHECK (
        (part_id IS NOT NULL AND action = 'removed') OR 
        (part_id IS NOT NULL) OR 
        (action = 'removed' AND part_id IS NULL)
    )
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_position_history_company 
    ON maint.position_history(operating_company_id);
CREATE INDEX IF NOT EXISTS idx_position_history_unit 
    ON maint.position_history(unit_id, action_at DESC);
CREATE INDEX IF NOT EXISTS idx_position_history_position 
    ON maint.position_history(position_set_id, position_code, action_at DESC);
CREATE INDEX IF NOT EXISTS idx_position_history_part 
    ON maint.position_history(part_id, action_at DESC);
CREATE INDEX IF NOT EXISTS idx_position_history_actor 
    ON maint.position_history(actor_id, action_at DESC);
CREATE INDEX IF NOT EXISTS idx_position_history_action_at 
    ON maint.position_history(action_at DESC);

-- RLS: Enable and create tenant policy
ALTER TABLE maint.position_history ENABLE ROW LEVEL SECURITY;

-- DO-block guard for policy (migration-role-validation safe)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'maint' 
        AND tablename = 'position_history' 
        AND policyname = 'tenant_isolation'
    ) THEN
        CREATE POLICY tenant_isolation ON maint.position_history
            FOR ALL
            TO ih35_app
            USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
    END IF;
END
$$;

-- FORCE ROW LEVEL SECURITY
ALTER TABLE maint.position_history FORCE ROW LEVEL SECURITY;

-- Grants: ih35_app ONLY (not authenticated or service_role)
GRANT SELECT, INSERT ON maint.position_history TO ih35_app;

COMMENT ON TABLE maint.position_history IS 'Immutable audit trail of part installations/removals/replacements per position';
COMMENT ON COLUMN maint.position_history.action IS 'installed: part placed in position; removed: part taken out; replaced: part swapped';

COMMIT;
