-- P7 Wave 2 v3 — accounting.periods + closed-period guards.

BEGIN;

CREATE TABLE IF NOT EXISTS accounting.periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  fiscal_year int NOT NULL,
  period_label text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closing', 'closed')),
  closed_at timestamptz,
  closed_by_user_id uuid REFERENCES identity.users(id),
  closing_notes text,
  retained_earnings_entry_id uuid REFERENCES accounting.journal_entries(id),
  locks_txn_dates_le date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_periods_company_end ON accounting.periods (operating_company_id, period_end DESC);

ALTER TABLE accounting.periods ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON accounting.periods TO ih35_app;

DROP POLICY IF EXISTS accounting_periods_company_scope ON accounting.periods;
CREATE POLICY accounting_periods_company_scope ON accounting.periods
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

CREATE OR REPLACE FUNCTION accounting.closed_period_cutoff(p_company uuid)
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT MAX(p.period_end)
  FROM accounting.periods p
  WHERE p.operating_company_id = p_company
    AND p.status = 'closed';
$$;

CREATE OR REPLACE FUNCTION accounting.raise_if_txn_in_closed_period(p_company uuid, p_txn_date date)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  cutoff date;
BEGIN
  cutoff := accounting.closed_period_cutoff(p_company);
  IF cutoff IS NOT NULL AND p_txn_date IS NOT NULL AND p_txn_date <= cutoff THEN
    RAISE EXCEPTION 'IH35_CLOSED_PERIOD closed_through=% txn_date=%',
      cutoff, p_txn_date
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION accounting.trg_block_closed_period_invoices()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM accounting.raise_if_txn_in_closed_period(NEW.operating_company_id, NEW.issue_date);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION accounting.trg_block_closed_period_bills()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM accounting.raise_if_txn_in_closed_period(NEW.operating_company_id, NEW.bill_date);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION accounting.trg_block_closed_period_payments()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM accounting.raise_if_txn_in_closed_period(NEW.operating_company_id, NEW.payment_date);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION accounting.trg_block_closed_period_bill_payments()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM accounting.raise_if_txn_in_closed_period(NEW.operating_company_id, NEW.payment_date);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION accounting.trg_block_closed_period_journal_entries()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM accounting.raise_if_txn_in_closed_period(NEW.operating_company_id, NEW.entry_date);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_closed_period_invoices ON accounting.invoices;
CREATE TRIGGER trg_block_closed_period_invoices
  BEFORE INSERT OR UPDATE OF issue_date, operating_company_id ON accounting.invoices
  FOR EACH ROW
  EXECUTE FUNCTION accounting.trg_block_closed_period_invoices();

DROP TRIGGER IF EXISTS trg_block_closed_period_bills ON accounting.bills;
CREATE TRIGGER trg_block_closed_period_bills
  BEFORE INSERT OR UPDATE OF bill_date, operating_company_id ON accounting.bills
  FOR EACH ROW
  EXECUTE FUNCTION accounting.trg_block_closed_period_bills();

DROP TRIGGER IF EXISTS trg_block_closed_period_payments ON accounting.payments;
CREATE TRIGGER trg_block_closed_period_payments
  BEFORE INSERT OR UPDATE OF payment_date, operating_company_id ON accounting.payments
  FOR EACH ROW
  EXECUTE FUNCTION accounting.trg_block_closed_period_payments();

DROP TRIGGER IF EXISTS trg_block_closed_period_bill_payments ON accounting.bill_payments;
CREATE TRIGGER trg_block_closed_period_bill_payments
  BEFORE INSERT OR UPDATE OF payment_date, operating_company_id ON accounting.bill_payments
  FOR EACH ROW
  EXECUTE FUNCTION accounting.trg_block_closed_period_bill_payments();

DROP TRIGGER IF EXISTS trg_block_closed_period_journal_entries ON accounting.journal_entries;
CREATE TRIGGER trg_block_closed_period_journal_entries
  BEFORE INSERT OR UPDATE OF entry_date, operating_company_id ON accounting.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION accounting.trg_block_closed_period_journal_entries();

COMMIT;
