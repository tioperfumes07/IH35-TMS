-- 202613400001_go20_slice_c_accident_liabilities.sql
-- GO-20 slice C (docs/lockdown/GO-20-EIGHT-FEATURES.txt, CC-1 money lane per the migration-lane
-- rule -- Cursor supervises/builds the frontend panel separately).
--
-- CORRECTION vs the design doc (live-verified 2026-09-02, Neon prod tiny-field-89581227): the doc
-- specs accident_liabilities.accident_id -> safety.accidents(id) and describes
-- safety.accident_cost_lines as belonging to that table. Live reality is different --
-- accident_cost_lines.accident_id already carries a REAL FK to safety.accident_reports(id)
-- (migration 202609180000, a HELD migration Jorge ran by hand), and the 3 live cost-line rows all
-- reference accident_report ids, none of which match safety.accidents' own single row (id
-- d01fe3c8, event_datetime 2026-09-15 -- future-dated, zero cost lines attached, looks like an
-- unrelated fixture, not the real accident-cost chain). Building the liability's assessed_amount
-- off safety.accidents would silently sum $0 forever, since no cost line will ever point there.
-- This migration anchors accident_liabilities.accident_id on safety.accident_reports(id) instead
-- -- the table that actually carries the cost lines this feature is meant to total.
--
-- Additive only, idempotent. FORCE RLS + 0065 grant pattern (SELECT/INSERT/UPDATE, never DELETE --
-- void-not-delete law).

BEGIN;

CREATE TABLE IF NOT EXISTS safety.accident_liabilities (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id      uuid NOT NULL REFERENCES org.companies(id),
  accident_id               uuid NOT NULL REFERENCES safety.accident_reports(id),
  driver_id                 uuid NULL REFERENCES mdata.drivers(id),
  unit_id                   uuid NULL REFERENCES mdata.units(id),
  trailer_id                uuid NULL REFERENCES mdata.equipment(id),
  load_id                   uuid NULL REFERENCES mdata.loads(id),
  customer_id               uuid NULL REFERENCES mdata.customers(id),
  vendor_id                 uuid NULL REFERENCES mdata.vendors(id),
  insurance_claim_id        uuid NULL REFERENCES insurance.claim(id),
  work_order_id             uuid NULL REFERENCES maintenance.work_orders(id),
  legal_matter_id           uuid NULL REFERENCES legal.matters(id),
  assessed_amount_cents     bigint NOT NULL,
  insurance_recovery_cents  bigint NOT NULL DEFAULT 0,
  deductible_cents          bigint NOT NULL DEFAULT 0,
  net_exposure_cents        bigint NOT NULL,
  -- 'driver_chargeback' | 'company_absorbs' | 'insurance_only' | 'split'
  owner_decision            text NULL,
  owner_decision_at         timestamptz NULL,
  owner_decision_by_user_id uuid NULL REFERENCES identity.users(id),
  owner_decision_note       text NULL,
  driver_charge_cents       bigint NOT NULL DEFAULT 0,
  company_absorb_cents      bigint NOT NULL DEFAULT 0,
  deduction_id              uuid NULL REFERENCES driver_finance.driver_settlement_deductions(id),
  journal_entry_id          uuid NULL REFERENCES accounting.journal_entries(id),
  expense_account_id        uuid NULL REFERENCES catalogs.accounts(id),
  -- open|decided|posted|closed
  status                    text NOT NULL DEFAULT 'open',
  voided_at                 timestamptz NULL,
  voided_by_user_id         uuid NULL REFERENCES identity.users(id),
  void_reason               text NULL,
  is_sample_data            boolean NOT NULL DEFAULT false,
  created_at                timestamptz NOT NULL DEFAULT now(),
  created_by_user_id        uuid NULL REFERENCES identity.users(id),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

DO $al_checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'safety.accident_liabilities'::regclass
      AND conname = 'accident_liabilities_owner_decision_check'
  ) THEN
    ALTER TABLE safety.accident_liabilities
      ADD CONSTRAINT accident_liabilities_owner_decision_check
      CHECK (owner_decision IS NULL OR owner_decision IN ('driver_chargeback', 'company_absorbs', 'insurance_only', 'split'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'safety.accident_liabilities'::regclass
      AND conname = 'accident_liabilities_status_check'
  ) THEN
    ALTER TABLE safety.accident_liabilities
      ADD CONSTRAINT accident_liabilities_status_check
      CHECK (status IN ('open', 'decided', 'posted', 'closed'));
  END IF;
END
$al_checks$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_liability_per_accident
  ON safety.accident_liabilities (operating_company_id, accident_id)
  WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_liability_awaiting_owner
  ON safety.accident_liabilities (operating_company_id, created_at DESC)
  WHERE owner_decision IS NULL AND voided_at IS NULL;

DO $al_rls$
BEGIN
  IF to_regclass('safety.accident_liabilities') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE safety.accident_liabilities ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE safety.accident_liabilities FORCE ROW LEVEL SECURITY';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'safety' AND tablename = 'accident_liabilities'
      AND policyname = 'accident_liabilities_tenant'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY accident_liabilities_tenant ON safety.accident_liabilities
        FOR ALL
        USING (
          identity.is_lucia_bypass()
          OR operating_company_id::text = current_setting('app.operating_company_id', true)
        )
        WITH CHECK (
          identity.is_lucia_bypass()
          OR operating_company_id::text = current_setting('app.operating_company_id', true)
        )
    $policy$;
  END IF;
  EXECUTE 'GRANT SELECT, INSERT, UPDATE ON safety.accident_liabilities TO ih35_app';
  EXECUTE 'REVOKE DELETE ON safety.accident_liabilities FROM ih35_app';
END
$al_rls$;

-- SECOND CORRECTION vs the design doc, found while applying this migration: insurance.claim.
-- liability_id is NOT a dangling FK-less column as the doc claims ("pointing at a table that was
-- never created"). It already carries a real, live constraint --
-- claim_liability_id_fkey -> driver_finance.driver_liabilities(id) ON DELETE SET NULL -- a
-- generic, already-populated (5 rows) driver-owes-money ledger used by the civil/internal-fines
-- "convert to liability" flow (apps/backend/src/safety/safety-v5.routes.ts's
-- driver_liability_id/converted_to_liability logic), a different shape entirely (no
-- insurance-recovery netting, no owner split decision, no company_absorbs concept) from the
-- accident-specific decision record this slice builds. Repointing that column would break the
-- fines flow that already depends on it live. NOT touching insurance.claim.liability_id here.
-- Linkage for THIS feature runs the other direction instead: safety.accident_liabilities.
-- insurance_claim_id (defined above) already points OUT to insurance.claim -- a valid,
-- already-established forward-link pattern in this codebase; the reverse lookup
-- (SELECT * FROM safety.accident_liabilities WHERE insurance_claim_id = $1) is the F+R pair.

COMMIT;
