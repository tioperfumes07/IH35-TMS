-- ACCT-F6350 metadata-only canonical declaration for the two already-live attribution tables.
-- Migration 202614060000 is applied and immutable. These byte-for-byte identical CREATE TABLE IF
-- NOT EXISTS declarations are deliberate no-ops: they change neither schema nor data, while giving
-- the static duplicate-ledger guard the canonical-design evidence it requires.
--
-- CANONICAL-CHECK: historical settlement attribution evidence. The canonical money headers remain
-- driver_finance.driver_settlements; canonical settlement economics remain
-- driver_finance.settlement_lines; canonical posting identity remains driver_finance.payrun_gl_runs
-- and accounting.journal_entries. driver_finance.historical_settlement_attributions and
-- driver_finance.historical_settlement_attribution_items contain append-only identity/provenance
-- evidence only. They allocate no money, post no journal lines, and replace none of those ledgers.

BEGIN;

CREATE TABLE IF NOT EXISTS driver_finance.historical_settlement_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE RESTRICT,
  source_settlement_id uuid NOT NULL REFERENCES driver_finance.driver_settlements(id) ON DELETE RESTRICT,
  source_payrun_id uuid NOT NULL REFERENCES driver_finance.payrun_gl_runs(id) ON DELETE RESTRICT,
  source_journal_entry_id uuid NOT NULL REFERENCES accounting.journal_entries(id) ON DELETE RESTRICT,
  target_settlement_id uuid NOT NULL REFERENCES driver_finance.driver_settlements(id) ON DELETE RESTRICT,
  source_document_ref text NOT NULL CHECK (btrim(source_document_ref) <> ''),
  allocation_basis text NOT NULL CHECK (allocation_basis IN ('identity_only', 'reconstructed_sources')),
  allocated_net_cents bigint,
  evidence jsonb NOT NULL,
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key text NOT NULL CHECK (btrim(idempotency_key) <> ''),
  supersedes_id uuid UNIQUE REFERENCES driver_finance.historical_settlement_attributions(id) ON DELETE RESTRICT,
  is_void boolean NOT NULL DEFAULT false,
  created_by_user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historical_settlement_attributions_identity_unallocated
    CHECK (allocation_basis <> 'identity_only' OR allocated_net_cents IS NULL),
  CONSTRAINT historical_settlement_attributions_company_idempotency_key
    UNIQUE (operating_company_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS driver_finance.historical_settlement_attribution_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE RESTRICT,
  attribution_id uuid NOT NULL REFERENCES driver_finance.historical_settlement_attributions(id) ON DELETE RESTRICT,
  load_id uuid NOT NULL REFERENCES mdata.loads(id) ON DELETE RESTRICT,
  source_settlement_line_id uuid REFERENCES driver_finance.settlement_lines(id) ON DELETE RESTRICT,
  evidence jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historical_settlement_attribution_items_line_key
    UNIQUE (attribution_id, load_id, source_settlement_line_id)
);

COMMIT;
