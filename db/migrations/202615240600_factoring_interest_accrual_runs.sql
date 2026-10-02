-- 202615240600_factoring_interest_accrual_runs.sql
-- Lead ROUND 296 approval (00-LEAD-APPROVAL-2026-10-02-FARO-LIFECYCLE-APPROVED-THREE-CORRECTIONS.md): "killing the nightly
-- interest posting ... Compute daily, show on screen, post ONE accrual at month-end close through the period-close engine
-- WITH APPROVAL, then true up to Faro's statement." Correction 2: DR 6830 Default Interest / CR 2155 Accrued Factoring
-- Interest — never 2150, so 2150 always equals the Net Amount of open Purchased Accounts.
--
-- A run is the month's accrual: one user PROPOSES it (lines computed per open Purchased Account from the contract —
-- 0.067%/day compounded daily from day 36 on the Net Amount, less what earlier posted runs already accrued), a SECOND user
-- APPROVES it (maker <> checker, enforced here) and only then does one journal entry post. A rejected run posts nothing.
-- One live (proposed or posted) run per company and period. Append-only: never a delete; audit on every row.

BEGIN;

CREATE TABLE IF NOT EXISTS accounting.factoring_interest_accrual_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  state text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'posted', 'rejected')),
  line_count integer NOT NULL CHECK (line_count >= 0),
  total_cents bigint NOT NULL CHECK (total_cents >= 0),
  proposed_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_by_user_id uuid REFERENCES identity.users(id),
  decided_at timestamptz,
  decision_note text,
  journal_entry_id uuid REFERENCES accounting.journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT factoring_interest_accrual_runs_period CHECK (period_end >= period_start),
  CONSTRAINT factoring_interest_accrual_runs_maker_not_checker CHECK (
    decided_by_user_id IS NULL OR decided_by_user_id <> proposed_by_user_id
  ),
  CONSTRAINT factoring_interest_accrual_runs_decided_has_actor CHECK (
    state = 'proposed' OR (decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL)
  ),
  CONSTRAINT factoring_interest_accrual_runs_posted_has_je CHECK (
    (state = 'posted') = (journal_entry_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_factoring_interest_accrual_runs_live_period
  ON accounting.factoring_interest_accrual_runs (operating_company_id, period_end)
  WHERE state IN ('proposed', 'posted');

CREATE TABLE IF NOT EXISTS accounting.factoring_interest_accrual_run_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  run_id uuid NOT NULL REFERENCES accounting.factoring_interest_accrual_runs(id),
  purchase_id uuid NOT NULL REFERENCES accounting.factoring_purchases(id),
  purchase_line_id uuid NOT NULL REFERENCES accounting.factoring_purchase_lines(id),
  invoice_id uuid NOT NULL REFERENCES accounting.invoices(id),
  customer_id uuid REFERENCES mdata.customers(id),
  purchase_date date NOT NULL,
  net_cents bigint NOT NULL CHECK (net_cents >= 0),
  days_charged integer NOT NULL CHECK (days_charged >= 0),
  cumulative_interest_cents bigint NOT NULL CHECK (cumulative_interest_cents >= 0),
  previously_accrued_cents bigint NOT NULL CHECK (previously_accrued_cents >= 0),
  accrual_cents bigint NOT NULL CHECK (accrual_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT factoring_interest_accrual_run_lines_one_per_line UNIQUE (run_id, purchase_line_id),
  CONSTRAINT factoring_interest_accrual_run_lines_math CHECK (accrual_cents = cumulative_interest_cents - previously_accrued_cents)
);

CREATE INDEX IF NOT EXISTS factoring_interest_accrual_run_lines_purchase_line_idx
  ON accounting.factoring_interest_accrual_run_lines (purchase_line_id);
CREATE INDEX IF NOT EXISTS factoring_interest_accrual_run_lines_invoice_idx
  ON accounting.factoring_interest_accrual_run_lines (invoice_id);

-- Same entity on every stamp; a line belongs to its run's company and its purchase.
CREATE OR REPLACE FUNCTION accounting.factoring_interest_accrual_line_same_entity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM accounting.factoring_interest_accrual_runs r WHERE r.id = NEW.run_id AND r.operating_company_id = NEW.operating_company_id) THEN
    RAISE EXCEPTION 'factoring_interest_accrual_line: run % is not in company %', NEW.run_id, NEW.operating_company_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM accounting.factoring_purchase_lines l
    JOIN accounting.factoring_purchases p ON p.id = l.purchase_id
    WHERE l.id = NEW.purchase_line_id AND p.id = NEW.purchase_id AND l.invoice_id = NEW.invoice_id
      AND l.operating_company_id = NEW.operating_company_id AND p.operating_company_id = NEW.operating_company_id
  ) THEN
    RAISE EXCEPTION 'factoring_interest_accrual_line: line % / purchase % / invoice % not in company %', NEW.purchase_line_id, NEW.purchase_id, NEW.invoice_id, NEW.operating_company_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_factoring_interest_accrual_line_same_entity ON accounting.factoring_interest_accrual_run_lines;
CREATE TRIGGER trg_factoring_interest_accrual_line_same_entity BEFORE INSERT OR UPDATE ON accounting.factoring_interest_accrual_run_lines
  FOR EACH ROW EXECUTE FUNCTION accounting.factoring_interest_accrual_line_same_entity();

-- Lines are frozen once their run leaves 'proposed'; a run's lines are written only while it is proposed.
CREATE OR REPLACE FUNCTION accounting.factoring_interest_accrual_line_frozen() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT state FROM accounting.factoring_interest_accrual_runs WHERE id = NEW.run_id) <> 'proposed' THEN
    RAISE EXCEPTION 'factoring_interest_accrual_line: run % is decided — its lines are frozen', NEW.run_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_factoring_interest_accrual_line_frozen ON accounting.factoring_interest_accrual_run_lines;
CREATE TRIGGER trg_factoring_interest_accrual_line_frozen BEFORE INSERT OR UPDATE ON accounting.factoring_interest_accrual_run_lines
  FOR EACH ROW EXECUTE FUNCTION accounting.factoring_interest_accrual_line_frozen();

-- A decided run never changes again.
CREATE OR REPLACE FUNCTION accounting.factoring_interest_accrual_run_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.state <> 'proposed' THEN
    RAISE EXCEPTION 'factoring_interest_accrual_run: run % is % — it never changes again', OLD.id, OLD.state;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_factoring_interest_accrual_run_guard ON accounting.factoring_interest_accrual_runs;
CREATE TRIGGER trg_factoring_interest_accrual_run_guard BEFORE UPDATE ON accounting.factoring_interest_accrual_runs
  FOR EACH ROW EXECUTE FUNCTION accounting.factoring_interest_accrual_run_guard();

DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON accounting.factoring_interest_accrual_runs;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.factoring_interest_accrual_runs
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();
DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON accounting.factoring_interest_accrual_run_lines;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.factoring_interest_accrual_run_lines
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();

DROP TRIGGER IF EXISTS tg_audit_row_factoring_interest_accrual_runs ON accounting.factoring_interest_accrual_runs;
CREATE TRIGGER tg_audit_row_factoring_interest_accrual_runs AFTER INSERT OR UPDATE OR DELETE ON accounting.factoring_interest_accrual_runs
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
DROP TRIGGER IF EXISTS tg_audit_row_factoring_interest_accrual_run_lines ON accounting.factoring_interest_accrual_run_lines;
CREATE TRIGGER tg_audit_row_factoring_interest_accrual_run_lines AFTER INSERT OR UPDATE OR DELETE ON accounting.factoring_interest_accrual_run_lines
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

ALTER TABLE accounting.factoring_interest_accrual_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.factoring_interest_accrual_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS factoring_interest_accrual_runs_company_isolation ON accounting.factoring_interest_accrual_runs;
CREATE POLICY factoring_interest_accrual_runs_company_isolation ON accounting.factoring_interest_accrual_runs
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
ALTER TABLE accounting.factoring_interest_accrual_run_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.factoring_interest_accrual_run_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS factoring_interest_accrual_run_lines_company_isolation ON accounting.factoring_interest_accrual_run_lines;
CREATE POLICY factoring_interest_accrual_run_lines_company_isolation ON accounting.factoring_interest_accrual_run_lines
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON accounting.factoring_interest_accrual_runs TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.factoring_interest_accrual_run_lines TO ih35_app;

COMMIT;
