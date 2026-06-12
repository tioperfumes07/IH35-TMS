-- D1: Settlement Approval Workspace Schema
-- Trip-number auto-link, per-line approval, escrow balance, driver-visible flags, dispute flags

-- Settlement approval state machine
ALTER TABLE driver_finance.settlements
ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'needs_review'
  CHECK (approval_status IN ('needs_review', 'approved', 'finalized')),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES identity.users(id),
ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pdf_generated_by UUID REFERENCES identity.users(id);

COMMENT ON COLUMN driver_finance.settlements.approval_status IS 'Needs review → Approved → Finalized. PDF only after Finalized.';

-- Settlement line items (deductions, additional pay, expenses) with approval tracking
CREATE TABLE IF NOT EXISTS driver_finance.settlement_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.operating_companies(id) ON DELETE CASCADE,
  settlement_id UUID NOT NULL REFERENCES driver_finance.settlements(id) ON DELETE CASCADE,

  -- Line classification
  line_type VARCHAR(30) NOT NULL CHECK (line_type IN ('deduction', 'additional_pay', 'expense', 'cash_advance', 'escrow')),
  category VARCHAR(50) NOT NULL, -- 'escrow_for_claims', 'cash_advance', 'admin_fee_gas', 'pay_enlonada', etc.

  -- Financials
  amount_cents INTEGER NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',

  -- Trip link (critical for expense tracking)
  load_id UUID REFERENCES dispatch.loads(id),
  load_number VARCHAR(50), -- Denormalized for display

  -- Source tracking
  source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('policy_auto', 'driver_requested', 'manual_entry', 'linked_expense')),
  source_id UUID, -- Links to original expense, cash advance request, etc.
  source_table VARCHAR(100), -- 'banking.driver_expenses', 'banking.cash_advances', etc.

  -- Approval state (per-line)
  approval_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES identity.users(id),
  rejected_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES identity.users(id),
  rejection_reason TEXT,

  -- Driver-visible flag (controls PDF content)
  driver_visible BOOLEAN NOT NULL DEFAULT true,

  -- Dispute flag
  disputed BOOLEAN NOT NULL DEFAULT false,
  disputed_at TIMESTAMPTZ,
  disputed_by UUID REFERENCES identity.drivers(id),
  dispute_reason TEXT,
  dispute_resolved_at TIMESTAMPTZ,
  dispute_resolved_by UUID REFERENCES identity.users(id),

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES identity.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE driver_finance.settlement_line_items IS 'Per-line items in a settlement with individual approval tracking';
COMMENT ON COLUMN driver_finance.settlement_line_items.load_id IS 'Trip number link - every expense must link to a load';
COMMENT ON COLUMN driver_finance.settlement_line_items.driver_visible IS 'If false, line is internal-only (not shown on driver PDF)';

-- RLS for settlement line items
ALTER TABLE driver_finance.settlement_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY settlement_line_items_tenant_isolation
ON driver_finance.settlement_line_items
FOR ALL
TO ih35_app
USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

-- Trip-link queue: expenses needing manual load assignment
CREATE TABLE IF NOT EXISTS driver_finance.trip_link_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.operating_companies(id) ON DELETE CASCADE,

  -- The expense needing a trip link
  expense_id UUID NOT NULL,
  expense_table VARCHAR(100) NOT NULL, -- 'maintenance.work_orders', 'banking.driver_expenses', etc.
  expense_type VARCHAR(50) NOT NULL, -- 'repair', 'road_service', 'toll', 'def', 'scale_fee'

  -- Truck and date for auto-link matching
  unit_id UUID REFERENCES mdata.units(id),
  expense_date DATE NOT NULL,

  -- Suggested match (if auto-link found one)
  suggested_load_id UUID REFERENCES dispatch.loads(id),
  suggested_load_number VARCHAR(50),
  suggested_reason TEXT, -- 'Truck T169 dispatched on load 13263, date 2026-05-19 in window'

  -- Resolution
  assigned_load_id UUID REFERENCES dispatch.loads(id),
  assigned_at TIMESTAMPTZ,
  assigned_by UUID REFERENCES identity.users(id),

  -- Settlement link (once resolved and added to settlement)
  settlement_line_item_id UUID REFERENCES driver_finance.settlement_line_items(id),

  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'suggested', 'assigned', 'linked')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE driver_finance.trip_link_queue IS 'Expenses needing manual trip number assignment before posting to settlement';

-- RLS for trip link queue
ALTER TABLE driver_finance.trip_link_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY trip_link_queue_tenant_isolation
ON driver_finance.trip_link_queue
FOR ALL
TO ih35_app
USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

-- Escrow running balance per driver
CREATE TABLE IF NOT EXISTS driver_finance.escrow_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.operating_companies(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES mdata.drivers(id) ON DELETE CASCADE,

  total_held_cents INTEGER NOT NULL DEFAULT 0,
  total_released_cents INTEGER NOT NULL DEFAULT 0,
  current_balance_cents INTEGER NOT NULL DEFAULT 0,

  -- Tracking
  last_settlement_id UUID REFERENCES driver_finance.settlements(id),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Escrow release schedule (when driver leaves)
  release_scheduled_at TIMESTAMPTZ,
  release_claims_window_days INTEGER DEFAULT 60,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'releasing', 'released')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (operating_company_id, driver_id)
);

COMMENT ON TABLE driver_finance.escrow_balances IS 'Running escrow balance per driver across all settlements';

-- RLS for escrow balances
ALTER TABLE driver_finance.escrow_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY escrow_balances_tenant_isolation
ON driver_finance.escrow_balances
FOR ALL
TO ih35_app
USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

-- Escrow ledger (detailed history)
CREATE TABLE IF NOT EXISTS driver_finance.escrow_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.operating_companies(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES mdata.drivers(id) ON DELETE CASCADE,
  escrow_balance_id UUID NOT NULL REFERENCES driver_finance.escrow_balances(id) ON DELETE CASCADE,

  settlement_id UUID REFERENCES driver_finance.settlements(id),
  settlement_line_item_id UUID REFERENCES driver_finance.settlement_line_items(id),

  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('hold', 'release', 'forfeit')),
  amount_cents INTEGER NOT NULL,
  running_balance_cents INTEGER NOT NULL,

  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE driver_finance.escrow_ledger IS 'Detailed escrow transaction history';

-- RLS for escrow ledger
ALTER TABLE driver_finance.escrow_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY escrow_ledger_tenant_isolation
ON driver_finance.escrow_ledger
FOR ALL
TO ih35_app
USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_settlement_line_items_settlement_id ON driver_finance.settlement_line_items(settlement_id);
CREATE INDEX IF NOT EXISTS idx_settlement_line_items_load_id ON driver_finance.settlement_line_items(load_id);
CREATE INDEX IF NOT EXISTS idx_settlement_line_items_approval_status ON driver_finance.settlement_line_items(approval_status);
CREATE INDEX IF NOT EXISTS idx_trip_link_queue_status ON driver_finance.trip_link_queue(status);
CREATE INDEX IF NOT EXISTS idx_trip_link_queue_unit_date ON driver_finance.trip_link_queue(unit_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_escrow_balances_driver ON driver_finance.escrow_balances(operating_company_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_escrow_ledger_driver ON driver_finance.escrow_ledger(escrow_balance_id, created_at DESC);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_finance.settlement_line_items TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_finance.trip_link_queue TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_finance.escrow_balances TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_finance.escrow_ledger TO ih35_app;

GRANT USAGE ON SEQUENCE driver_finance.settlement_line_items_id_seq TO ih35_app;
GRANT USAGE ON SEQUENCE driver_finance.trip_link_queue_id_seq TO ih35_app;
GRANT USAGE ON SEQUENCE driver_finance.escrow_balances_id_seq TO ih35_app;
GRANT USAGE ON SEQUENCE driver_finance.escrow_ledger_id_seq TO ih35_app;
