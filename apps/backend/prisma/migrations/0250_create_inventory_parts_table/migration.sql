-- Operational inventory parts table (non-financial, no GL posting)
-- RLS-scoped by operating_company_id per project standards

CREATE TABLE IF NOT EXISTS inventory.parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_company_id UUID NOT NULL REFERENCES catalogs.companies(id),
    name TEXT NOT NULL,
    sku TEXT,
    category TEXT,
    on_hand_qty INTEGER DEFAULT 0,
    reorder_point INTEGER DEFAULT 0,
    unit_cost DECIMAL(10,2) DEFAULT 0,
    location TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES identity.users(id),
    updated_by UUID REFERENCES identity.users(id),
    row_changes JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE inventory.parts ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only see their own company's parts
CREATE POLICY parts_company_isolation ON inventory.parts
    FOR ALL
    TO app
    USING (operating_company_id = current_setting('app.operating_company_id')::UUID);

-- Indexes for performance
CREATE INDEX idx_parts_company ON inventory.parts(operating_company_id);
CREATE INDEX idx_parts_sku ON inventory.parts(sku);
CREATE INDEX idx_parts_category ON inventory.parts(category);
CREATE INDEX idx_parts_active ON inventory.parts(is_active);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION inventory.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_parts_updated_at
    BEFORE UPDATE ON inventory.parts
    FOR EACH ROW
    EXECUTE FUNCTION inventory.set_updated_at();

COMMENT ON TABLE inventory.parts IS 'Operational parts inventory (non-financial, no GL posting)';
