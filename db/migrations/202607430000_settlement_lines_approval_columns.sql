-- [HOLD-FOR-JORGE — FINANCIAL] Settlement collapse Phase 1 — additive approval/dispute/source columns on the
-- canonical driver_finance.settlement_lines, so the settlements/approval.service.ts flow (currently on RETIRE
-- settlement.settlement_line, 28 cols) can be repointed onto canonical in Phase 2 WITHOUT dropping any field.
--
-- Owner ratified driver_finance.* as THE settlement engine. This migration ADDS COLUMNS ONLY — additive,
-- idempotent (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS), on a 0-row table. driver_finance.
-- settlement_lines already carries FORCED RLS + grants (additive columns inherit them — no grant change).
-- operating_company_id already exists on the table and is intentionally NOT re-added.
-- Column names + types verified against settlement.settlement_line (the RETIRE source) and prod live schema.
-- Runs on a Neon branch by owner/GUARD, then ledger-backfilled. Adds no data; moves no money.

BEGIN;

-- linkage / source-trace (Phase-2 repoint populates these; NOT NULL enforced later once backfilled)
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS load_id uuid REFERENCES mdata.loads(id);
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS source_table text;
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS source_reference_id uuid;
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- approval workflow (parity with settlement.settlement_line)
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS approval_status varchar(20) NOT NULL DEFAULT 'pending'
  CHECK (approval_status IN ('pending','approved','rejected'));
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES identity.users(id);
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES identity.users(id);
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS rejection_reason text;

-- driver visibility + dispute workflow
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS driver_visible boolean NOT NULL DEFAULT true;
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS disputed boolean NOT NULL DEFAULT false;
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS disputed_at timestamptz;
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS disputed_by uuid REFERENCES mdata.drivers(id);
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS dispute_reason text;
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS dispute_resolved_at timestamptz;
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS dispute_resolved_by uuid REFERENCES identity.users(id);

-- categorization / source classification
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS category varchar(50);
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS source_type varchar(30)
  CHECK (source_type IS NULL OR source_type IN ('policy_auto','driver_requested','manual_entry','linked_expense'));
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS source_id uuid;
ALTER TABLE driver_finance.settlement_lines ADD COLUMN IF NOT EXISTS split_partner_driver_id uuid REFERENCES mdata.drivers(id);

-- read-path indexes
CREATE INDEX IF NOT EXISTS idx_df_settlement_lines_approval_status ON driver_finance.settlement_lines (approval_status);
CREATE INDEX IF NOT EXISTS idx_df_settlement_lines_disputed ON driver_finance.settlement_lines (disputed) WHERE disputed;

COMMIT;
