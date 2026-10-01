-- RECLASSIFY TRANSACTIONS ENGINE (Lead, 2026-10-01) — owner QBO spec docs/design/2026-10-01-QBO-REGISTER-MECHANISM-SPEC.md §24
-- Owner: "very important to build, follow for the batch transactions". Claimed 202615170000 (Lead band HH 00).
--
-- QBO Tools → Reclassify works on GL LINES: filter → select many → change account / class / vendor → every
-- document is updated and re-posted, audit per document, undo per batch. The IH35 ledger is append-only
-- (WORM: no posting is ever edited or deleted), so a reclassification is a RECLASSIFICATION journal entry
-- per source document — one pair of lines per reclassified posting (reverse the old side, post the new
-- side) — and the source document line is rewritten so document and ledger agree. One batch per Apply.
-- Additive: no existing table is altered.
-- CANONICAL-CHECK: accounting.reclassify_batches / accounting.reclassify_batch_lines are the only
-- registers of bulk re-categorization; the money itself lives only in accounting.journal_entries /
-- accounting.journal_entry_postings (RECLASSIFICATION type).

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS accounting.reclassify_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  created_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 3),
  -- the filter the user applied when selecting (date range, account, type, class, search) — evidence only
  filter_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- what the user asked to change; NULL = unchanged (QBO modal: account / class / vendor-customer, each optional)
  to_account_id uuid REFERENCES catalogs.accounts(id),
  to_class_id uuid REFERENCES catalogs.classes(id),
  to_entity_uuid uuid,
  to_entity_type text CHECK (to_entity_type IS NULL OR to_entity_type IN ('customer','vendor','driver','unit')),
  status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied','undone')),
  lines_requested integer NOT NULL DEFAULT 0,
  lines_applied integer NOT NULL DEFAULT 0,
  lines_refused integer NOT NULL DEFAULT 0,
  amount_cents_moved bigint NOT NULL DEFAULT 0,
  undone_at timestamptz,
  undone_by_user_id uuid REFERENCES identity.users(id),
  undo_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reclassify_batches_entity_pair CHECK ((to_entity_uuid IS NULL) = (to_entity_type IS NULL)),
  CONSTRAINT reclassify_batches_changes_something CHECK (to_account_id IS NOT NULL OR to_class_id IS NOT NULL OR to_entity_uuid IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS accounting.reclassify_batch_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES accounting.reclassify_batches(id),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  -- the GL line the user selected (never edited; the reclass JE moves it)
  posting_id uuid NOT NULL REFERENCES accounting.journal_entry_postings(id),
  journal_entry_id uuid NOT NULL REFERENCES accounting.journal_entries(id),
  source_transaction_type text,
  source_transaction_id text,
  source_transaction_line_id text,
  from_account_id uuid NOT NULL REFERENCES catalogs.accounts(id),
  from_class_id uuid REFERENCES catalogs.classes(id),
  from_entity_uuid uuid,
  from_entity_type text,
  to_account_id uuid NOT NULL REFERENCES catalogs.accounts(id),
  to_class_id uuid REFERENCES catalogs.classes(id),
  to_entity_uuid uuid,
  to_entity_type text,
  debit_or_credit text NOT NULL CHECK (debit_or_credit IN ('debit','credit')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  result text NOT NULL CHECK (result IN ('applied','refused')),
  refusal_reason text,
  -- the RECLASSIFICATION journal entry that carries this line's pair (NULL when refused)
  reclass_journal_entry_id uuid REFERENCES accounting.journal_entries(id),
  -- whether the source document line was rewritten to match (expense_lines / bill_lines); false + reason when it could not be
  document_updated boolean NOT NULL DEFAULT false,
  document_update_note text,
  undo_journal_entry_id uuid REFERENCES accounting.journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reclassify_batch_lines_refused_has_reason CHECK (result <> 'refused' OR refusal_reason IS NOT NULL),
  CONSTRAINT reclassify_batch_lines_applied_has_je CHECK (result <> 'applied' OR reclass_journal_entry_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_reclassify_batches_company_created ON accounting.reclassify_batches (operating_company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reclassify_batch_lines_batch ON accounting.reclassify_batch_lines (batch_id);
CREATE INDEX IF NOT EXISTS idx_reclassify_batch_lines_posting ON accounting.reclassify_batch_lines (posting_id);
CREATE INDEX IF NOT EXISTS idx_reclassify_batch_lines_source ON accounting.reclassify_batch_lines (source_transaction_type, source_transaction_id);

ALTER TABLE accounting.reclassify_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.reclassify_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE accounting.reclassify_batch_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.reclassify_batch_lines FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reclassify_batches_company_isolation ON accounting.reclassify_batches;
CREATE POLICY reclassify_batches_company_isolation ON accounting.reclassify_batches
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
DROP POLICY IF EXISTS reclassify_batch_lines_company_isolation ON accounting.reclassify_batch_lines;
CREATE POLICY reclassify_batch_lines_company_isolation ON accounting.reclassify_batch_lines
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON accounting.reclassify_batches TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.reclassify_batch_lines TO ih35_app;

-- WORM: batch registers are financial evidence; never deleted (same trigger family as journal entries).
DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON accounting.reclassify_batches;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.reclassify_batches
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();
DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON accounting.reclassify_batch_lines;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.reclassify_batch_lines
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();

COMMENT ON TABLE accounting.reclassify_batches IS 'Reclassify Transactions (QBO Tools→Reclassify clone): one row per Apply; the money moves in RECLASSIFICATION journal entries, never by editing a posting.';
COMMENT ON TABLE accounting.reclassify_batch_lines IS 'One row per GL posting the user selected: from→to account/class/entity, the reclass JE that carries it, whether the source document line was rewritten, or the refusal reason.';
