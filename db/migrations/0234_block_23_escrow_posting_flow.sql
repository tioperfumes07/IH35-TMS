BEGIN;

CREATE TABLE IF NOT EXISTS accounting.escrow_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  holder_id uuid NOT NULL,
  holder_type text NOT NULL CHECK (holder_type IN ('driver','vendor','factor','other')),
  purpose text NOT NULL CHECK (purpose IN ('driver_bond','repair_reserve','factor_reserve','other')),
  coa_account_id uuid NOT NULL REFERENCES catalogs.accounts(id),
  balance_cents bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, holder_id, purpose)
);

CREATE INDEX IF NOT EXISTS ix_escrow_accounts_company_status
  ON accounting.escrow_accounts (operating_company_id, status, purpose);

CREATE TABLE IF NOT EXISTS accounting.escrow_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  escrow_account_id uuid NOT NULL REFERENCES accounting.escrow_accounts(id) ON DELETE RESTRICT,
  posting_type text NOT NULL CHECK (posting_type IN ('deposit','release','adjustment')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  source_type text NOT NULL CHECK (source_type IN ('driver_settlement','factoring_advance','vendor_bill','manual','reconciliation')),
  source_id uuid NULL,
  note text NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  posted_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  linked_journal_entry_id uuid NULL REFERENCES accounting.journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_escrow_postings_account_posted_at
  ON accounting.escrow_postings (escrow_account_id, posted_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS ix_escrow_postings_company_source
  ON accounting.escrow_postings (operating_company_id, source_type, source_id);

CREATE OR REPLACE FUNCTION accounting.touch_escrow_accounts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_escrow_accounts_updated_at ON accounting.escrow_accounts;
CREATE TRIGGER trg_touch_escrow_accounts_updated_at
  BEFORE UPDATE ON accounting.escrow_accounts
  FOR EACH ROW EXECUTE FUNCTION accounting.touch_escrow_accounts_updated_at();

CREATE OR REPLACE FUNCTION accounting.apply_escrow_posting_delta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_delta bigint;
BEGIN
  IF NEW.posting_type = 'deposit' THEN
    v_delta := NEW.amount_cents;
  ELSIF NEW.posting_type = 'release' THEN
    v_delta := -NEW.amount_cents;
  ELSE
    v_delta := NEW.amount_cents;
  END IF;

  UPDATE accounting.escrow_accounts
  SET balance_cents = balance_cents + v_delta,
      updated_at = now()
  WHERE id = NEW.escrow_account_id
    AND operating_company_id = NEW.operating_company_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_escrow_posting_delta ON accounting.escrow_postings;
CREATE TRIGGER trg_apply_escrow_posting_delta
  AFTER INSERT ON accounting.escrow_postings
  FOR EACH ROW EXECUTE FUNCTION accounting.apply_escrow_posting_delta();

CREATE OR REPLACE FUNCTION accounting.prevent_escrow_posting_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'accounting.escrow_postings is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_no_update_escrow_postings ON accounting.escrow_postings;
CREATE TRIGGER trg_no_update_escrow_postings
  BEFORE UPDATE ON accounting.escrow_postings
  FOR EACH ROW EXECUTE FUNCTION accounting.prevent_escrow_posting_mutation();

DROP TRIGGER IF EXISTS trg_no_delete_escrow_postings ON accounting.escrow_postings;
CREATE TRIGGER trg_no_delete_escrow_postings
  BEFORE DELETE ON accounting.escrow_postings
  FOR EACH ROW EXECUTE FUNCTION accounting.prevent_escrow_posting_mutation();

ALTER TABLE accounting.escrow_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.escrow_postings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS escrow_accounts_company_scope ON accounting.escrow_accounts;
CREATE POLICY escrow_accounts_company_scope
  ON accounting.escrow_accounts
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS escrow_postings_company_scope ON accounting.escrow_postings;
CREATE POLICY escrow_postings_company_scope
  ON accounting.escrow_postings
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON accounting.escrow_accounts TO ih35_app;
GRANT SELECT, INSERT ON accounting.escrow_postings TO ih35_app;

COMMIT;
