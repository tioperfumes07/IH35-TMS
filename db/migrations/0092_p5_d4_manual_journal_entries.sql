BEGIN;

CREATE SCHEMA IF NOT EXISTS accounting;

CREATE TABLE IF NOT EXISTS accounting.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  entry_date date NOT NULL,
  memo text,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'voided')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto')),
  created_by_user_id uuid REFERENCES identity.users(id),
  voided_at timestamptz,
  voided_by_user_id uuid REFERENCES identity.users(id),
  void_reason text,
  qbo_journal_entry_id text,
  qbo_sync_pending boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounting.journal_entry_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  journal_entry_uuid uuid NOT NULL REFERENCES accounting.journal_entries(id) ON DELETE CASCADE,
  line_sequence int NOT NULL CHECK (line_sequence > 0),
  account_id uuid NOT NULL REFERENCES catalogs.accounts(id),
  class_id uuid REFERENCES catalogs.classes(id),
  entity_uuid uuid,
  debit_or_credit text NOT NULL CHECK (debit_or_credit IN ('debit', 'credit')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_company_entry_date
  ON accounting.journal_entries (operating_company_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_journal_entry_postings_entry_uuid
  ON accounting.journal_entry_postings (journal_entry_uuid);

CREATE OR REPLACE FUNCTION accounting.ensure_journal_entry_balanced()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_id uuid;
  debit_total bigint;
  credit_total bigint;
BEGIN
  target_id := COALESCE(NEW.journal_entry_uuid, OLD.journal_entry_uuid);
  IF target_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN debit_or_credit = 'debit' THEN amount_cents ELSE 0 END), 0)::bigint,
    COALESCE(SUM(CASE WHEN debit_or_credit = 'credit' THEN amount_cents ELSE 0 END), 0)::bigint
  INTO debit_total, credit_total
  FROM accounting.journal_entry_postings
  WHERE journal_entry_uuid = target_id;

  IF debit_total <> credit_total THEN
    RAISE EXCEPTION 'journal entry % is not balanced (debits=% credits=%)', target_id, debit_total, credit_total
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_check_journal_entry_balanced ON accounting.journal_entry_postings;
CREATE CONSTRAINT TRIGGER trg_check_journal_entry_balanced
AFTER INSERT OR UPDATE OR DELETE ON accounting.journal_entry_postings
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION accounting.ensure_journal_entry_balanced();

ALTER TABLE accounting.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.journal_entry_postings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journal_entries_company_scope ON accounting.journal_entries;
CREATE POLICY journal_entries_company_scope
  ON accounting.journal_entries
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS journal_entry_postings_company_scope ON accounting.journal_entry_postings;
CREATE POLICY journal_entry_postings_company_scope
  ON accounting.journal_entry_postings
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON accounting.journal_entries TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.journal_entry_postings TO ih35_app;

COMMIT;
