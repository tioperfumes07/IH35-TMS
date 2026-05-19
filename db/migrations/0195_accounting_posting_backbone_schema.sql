BEGIN;

CREATE TABLE IF NOT EXISTS accounting.posting_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  batch_status text NOT NULL,
  source_transaction_type text,
  source_transaction_id text,
  idempotency_key text,
  created_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE accounting.posting_batches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'accounting'
      AND tablename = 'posting_batches'
      AND policyname = 'posting_batches_company_scope'
  ) THEN
    CREATE POLICY posting_batches_company_scope
      ON accounting.posting_batches
      FOR ALL TO ih35_app
      USING (
        operating_company_id::text = current_setting('app.operating_company_id', true)
        OR current_setting('app.bypass_rls', true) = 'lucia'
      )
      WITH CHECK (
        operating_company_id::text = current_setting('app.operating_company_id', true)
        OR current_setting('app.bypass_rls', true) = 'lucia'
      );
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE ON accounting.posting_batches TO ih35_app;

CREATE TABLE IF NOT EXISTS accounting.transaction_source_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  journal_entry_posting_id uuid NOT NULL REFERENCES accounting.journal_entry_postings(id),
  linked_object_type text NOT NULL,
  linked_object_id text NOT NULL,
  relationship_role text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE accounting.transaction_source_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'accounting'
      AND tablename = 'transaction_source_links'
      AND policyname = 'transaction_source_links_company_scope'
  ) THEN
    CREATE POLICY transaction_source_links_company_scope
      ON accounting.transaction_source_links
      FOR ALL TO ih35_app
      USING (
        operating_company_id::text = current_setting('app.operating_company_id', true)
        OR current_setting('app.bypass_rls', true) = 'lucia'
      )
      WITH CHECK (
        operating_company_id::text = current_setting('app.operating_company_id', true)
        OR current_setting('app.bypass_rls', true) = 'lucia'
      );
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE ON accounting.transaction_source_links TO ih35_app;

ALTER TABLE accounting.journal_entry_postings
  ADD COLUMN IF NOT EXISTS source_transaction_type text,
  ADD COLUMN IF NOT EXISTS source_transaction_id text,
  ADD COLUMN IF NOT EXISTS source_transaction_line_id text,
  ADD COLUMN IF NOT EXISTS posting_batch_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS reversal_of_line_id uuid,
  ADD COLUMN IF NOT EXISTS reversed_by_line_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_jep_posting_batch_id'
      AND connamespace = 'accounting'::regnamespace
  ) THEN
    ALTER TABLE accounting.journal_entry_postings
      ADD CONSTRAINT fk_jep_posting_batch_id
      FOREIGN KEY (posting_batch_id) REFERENCES accounting.posting_batches(id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_jep_reversal_of_line_id'
      AND connamespace = 'accounting'::regnamespace
  ) THEN
    ALTER TABLE accounting.journal_entry_postings
      ADD CONSTRAINT fk_jep_reversal_of_line_id
      FOREIGN KEY (reversal_of_line_id) REFERENCES accounting.journal_entry_postings(id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_jep_reversed_by_line_id'
      AND connamespace = 'accounting'::regnamespace
  ) THEN
    ALTER TABLE accounting.journal_entry_postings
      ADD CONSTRAINT fk_jep_reversed_by_line_id
      FOREIGN KEY (reversed_by_line_id) REFERENCES accounting.journal_entry_postings(id);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_jep_source_posting_batch
  ON accounting.journal_entry_postings (
    operating_company_id,
    source_transaction_type,
    source_transaction_id,
    source_transaction_line_id,
    posting_batch_id
  )
  WHERE source_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_posting_batches_company_idempotency_key
  ON accounting.posting_batches (operating_company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jep_posting_batch_id
  ON accounting.journal_entry_postings (posting_batch_id);

CREATE INDEX IF NOT EXISTS idx_transaction_source_links_jep_id
  ON accounting.transaction_source_links (journal_entry_posting_id);

CREATE INDEX IF NOT EXISTS idx_transaction_source_links_object
  ON accounting.transaction_source_links (linked_object_type, linked_object_id);

COMMIT;
