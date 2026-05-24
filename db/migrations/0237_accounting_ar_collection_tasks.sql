BEGIN;

CREATE TABLE IF NOT EXISTS accounting.ar_collection_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  customer_id uuid NOT NULL REFERENCES mdata.customers(id),
  invoice_id uuid NOT NULL REFERENCES accounting.invoices(id) ON DELETE RESTRICT,
  owed_cents bigint NOT NULL DEFAULT 0 CHECK (owed_cents >= 0),
  days_overdue int NOT NULL DEFAULT 0 CHECK (days_overdue >= 0),
  aging_bucket text NOT NULL CHECK (aging_bucket IN ('current', '1_30', '31_60', '61_90', '91_plus')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'contacted', 'promised', 'escalated', 'resolved')),
  resolution text NULL CHECK (resolution IN ('paid', 'disputed', 'written_off')),
  assigned_to_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  last_contact_at timestamptz NULL,
  next_action_date date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL,
  UNIQUE (operating_company_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS ix_ar_collection_tasks_company_status_next_action
  ON accounting.ar_collection_tasks (operating_company_id, status, next_action_date);

CREATE INDEX IF NOT EXISTS ix_ar_collection_tasks_assigned_status
  ON accounting.ar_collection_tasks (assigned_to_user_id, status);

CREATE TABLE IF NOT EXISTS accounting.ar_collection_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES accounting.ar_collection_tasks(id) ON DELETE CASCADE,
  contact_type text NOT NULL CHECK (contact_type IN ('call', 'email', 'letter', 'sms')),
  notes text NOT NULL DEFAULT '',
  next_action_date date NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_ar_collection_contacts_task_created
  ON accounting.ar_collection_contacts (task_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION accounting.touch_ar_collection_tasks_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_ar_collection_tasks_updated_at ON accounting.ar_collection_tasks;
CREATE TRIGGER trg_touch_ar_collection_tasks_updated_at
  BEFORE UPDATE ON accounting.ar_collection_tasks
  FOR EACH ROW
  EXECUTE FUNCTION accounting.touch_ar_collection_tasks_updated_at();

ALTER TABLE accounting.ar_collection_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.ar_collection_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ar_collection_tasks_company_scope ON accounting.ar_collection_tasks;
CREATE POLICY ar_collection_tasks_company_scope
  ON accounting.ar_collection_tasks
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS ar_collection_contacts_company_scope ON accounting.ar_collection_contacts;
CREATE POLICY ar_collection_contacts_company_scope
  ON accounting.ar_collection_contacts
  FOR ALL TO ih35_app
  USING (
    EXISTS (
      SELECT 1
      FROM accounting.ar_collection_tasks t
      WHERE t.id = task_id
        AND (
          t.operating_company_id::text = current_setting('app.operating_company_id', true)
          OR current_setting('app.bypass_rls', true) = 'lucia'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM accounting.ar_collection_tasks t
      WHERE t.id = task_id
        AND (
          t.operating_company_id::text = current_setting('app.operating_company_id', true)
          OR current_setting('app.bypass_rls', true) = 'lucia'
        )
    )
  );

GRANT USAGE ON SCHEMA accounting TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.ar_collection_tasks TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.ar_collection_contacts TO ih35_app;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA accounting TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON accounting.ar_collection_tasks TO authenticated';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON accounting.ar_collection_contacts TO authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA accounting TO service_role';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON accounting.ar_collection_tasks TO service_role';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON accounting.ar_collection_contacts TO service_role';
  END IF;
END $$;

COMMIT;
