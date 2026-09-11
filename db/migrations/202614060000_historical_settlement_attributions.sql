BEGIN;

-- ACCT-F6350 historical settlement attribution.
-- Evidence-only: this migration creates no attribution rows, changes no settlement/payrun/JE,
-- and allocates no money. The original posted obligation remains untouched. Corrections are new
-- successor rows; both tables are WORM at grants and trigger layers.

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

CREATE INDEX IF NOT EXISTS ix_historical_settlement_attributions_company_source
  ON driver_finance.historical_settlement_attributions (operating_company_id, source_settlement_id);
CREATE INDEX IF NOT EXISTS ix_historical_settlement_attributions_company_target
  ON driver_finance.historical_settlement_attributions (operating_company_id, target_settlement_id);
CREATE INDEX IF NOT EXISTS ix_historical_settlement_attributions_company_source_je
  ON driver_finance.historical_settlement_attributions (operating_company_id, source_journal_entry_id);

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

CREATE UNIQUE INDEX IF NOT EXISTS uq_historical_settlement_attribution_items_membership
  ON driver_finance.historical_settlement_attribution_items (attribution_id, load_id)
  WHERE source_settlement_line_id IS NULL;
CREATE INDEX IF NOT EXISTS ix_historical_settlement_attribution_items_company_load
  ON driver_finance.historical_settlement_attribution_items (operating_company_id, load_id);
CREATE INDEX IF NOT EXISTS ix_historical_settlement_attribution_items_attribution
  ON driver_finance.historical_settlement_attribution_items (attribution_id);

-- Validate every source edge under a table-owner SECURITY DEFINER trigger so an Owner session's broad
-- visibility cannot substitute for explicit company predicates. The payrun must be the source settlement's
-- posted run and must point to the same posted journal entry. A correction may supersede only a row in the
-- same company and preserve the immutable original settlement/payrun/JE lineage; no trigger mutates
-- the original evidence row. A correction may deliberately point at a different target settlement.
CREATE OR REPLACE FUNCTION driver_finance.validate_historical_settlement_attribution_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM driver_finance.driver_settlements s
    WHERE s.id = NEW.source_settlement_id AND s.operating_company_id = NEW.operating_company_id
  ) THEN
    RAISE EXCEPTION 'historical attribution source settlement company mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM driver_finance.driver_settlements s
    WHERE s.id = NEW.target_settlement_id AND s.operating_company_id = NEW.operating_company_id
  ) THEN
    RAISE EXCEPTION 'historical attribution target settlement company mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM driver_finance.payrun_gl_runs r
    WHERE r.id = NEW.source_payrun_id
      AND r.operating_company_id = NEW.operating_company_id
      AND r.settlement_id = NEW.source_settlement_id
      AND r.journal_entry_id = NEW.source_journal_entry_id
      AND r.status = 'posted'
  ) THEN
    RAISE EXCEPTION 'historical attribution source payrun/settlement/journal mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM accounting.journal_entries je
    WHERE je.id = NEW.source_journal_entry_id
      AND je.operating_company_id = NEW.operating_company_id
      AND je.status = 'posted'
  ) THEN
    RAISE EXCEPTION 'historical attribution source journal company/status mismatch';
  END IF;
  IF NEW.supersedes_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM driver_finance.historical_settlement_attributions prior
    WHERE prior.id = NEW.supersedes_id
      AND prior.operating_company_id = NEW.operating_company_id
      AND prior.source_settlement_id = NEW.source_settlement_id
      AND prior.source_payrun_id = NEW.source_payrun_id
      AND prior.source_journal_entry_id = NEW.source_journal_entry_id
  ) THEN
    RAISE EXCEPTION 'historical attribution supersedes company/source lineage mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION driver_finance.validate_historical_settlement_attribution_item_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  source_settlement uuid;
  superseded_attribution uuid;
BEGIN
  SELECT a.source_settlement_id, a.supersedes_id
    INTO source_settlement, superseded_attribution
  FROM driver_finance.historical_settlement_attributions a
  WHERE a.id = NEW.attribution_id
    AND a.operating_company_id = NEW.operating_company_id;
  IF source_settlement IS NULL THEN
    RAISE EXCEPTION 'historical attribution item parent company mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM mdata.loads l
    WHERE l.id = NEW.load_id AND l.operating_company_id = NEW.operating_company_id
  ) THEN
    RAISE EXCEPTION 'historical attribution item load company mismatch';
  END IF;
  IF NEW.source_settlement_line_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM driver_finance.settlement_lines sl
    LEFT JOIN driver_finance.driver_bills b
      ON b.id = sl.source_driver_bill_id
     AND b.operating_company_id = sl.operating_company_id
    WHERE sl.id = NEW.source_settlement_line_id
      AND sl.operating_company_id = NEW.operating_company_id
      AND sl.settlement_id = source_settlement
      AND COALESCE(b.load_id, sl.load_id) = NEW.load_id
  ) THEN
    RAISE EXCEPTION 'historical attribution item source line/company/load mismatch';
  END IF;
  IF NEW.source_settlement_line_id IS NULL AND NOT (
    EXISTS (
      SELECT 1
      FROM mdata.loads l
      JOIN driver_finance.driver_settlements s
        ON s.id = source_settlement
       AND s.operating_company_id = NEW.operating_company_id
      WHERE l.id = NEW.load_id
        AND l.operating_company_id = NEW.operating_company_id
        AND (l.presettlement_link_id = source_settlement OR s.first_load_id = NEW.load_id)
    )
    OR (
      superseded_attribution IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM driver_finance.historical_settlement_attribution_items prior_item
        WHERE prior_item.attribution_id = superseded_attribution
          AND prior_item.operating_company_id = NEW.operating_company_id
          AND prior_item.load_id = NEW.load_id
      )
    )
  ) THEN
    RAISE EXCEPTION 'historical attribution membership load is not part of original source lineage';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION driver_finance.block_historical_settlement_attribution_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'historical settlement attribution evidence is append-only: % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_historical_settlement_attributions_validate_insert
  ON driver_finance.historical_settlement_attributions;
CREATE TRIGGER trg_historical_settlement_attributions_validate_insert
  BEFORE INSERT ON driver_finance.historical_settlement_attributions
  FOR EACH ROW EXECUTE FUNCTION driver_finance.validate_historical_settlement_attribution_insert();

DROP TRIGGER IF EXISTS trg_historical_settlement_attribution_items_validate_insert
  ON driver_finance.historical_settlement_attribution_items;
CREATE TRIGGER trg_historical_settlement_attribution_items_validate_insert
  BEFORE INSERT ON driver_finance.historical_settlement_attribution_items
  FOR EACH ROW EXECUTE FUNCTION driver_finance.validate_historical_settlement_attribution_item_insert();

DROP TRIGGER IF EXISTS trg_historical_settlement_attributions_immutable
  ON driver_finance.historical_settlement_attributions;
CREATE TRIGGER trg_historical_settlement_attributions_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON driver_finance.historical_settlement_attributions
  FOR EACH STATEMENT EXECUTE FUNCTION driver_finance.block_historical_settlement_attribution_mutation();

DROP TRIGGER IF EXISTS trg_historical_settlement_attribution_items_immutable
  ON driver_finance.historical_settlement_attribution_items;
CREATE TRIGGER trg_historical_settlement_attribution_items_immutable
  BEFORE UPDATE OR DELETE OR TRUNCATE ON driver_finance.historical_settlement_attribution_items
  FOR EACH STATEMENT EXECUTE FUNCTION driver_finance.block_historical_settlement_attribution_mutation();

ALTER TABLE driver_finance.historical_settlement_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.historical_settlement_attributions FORCE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.historical_settlement_attribution_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.historical_settlement_attribution_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS historical_settlement_attributions_select ON driver_finance.historical_settlement_attributions;
CREATE POLICY historical_settlement_attributions_select
  ON driver_finance.historical_settlement_attributions FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );
DROP POLICY IF EXISTS historical_settlement_attributions_insert ON driver_finance.historical_settlement_attributions;
CREATE POLICY historical_settlement_attributions_insert
  ON driver_finance.historical_settlement_attributions FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
      AND identity.current_user_role() IN ('Owner', 'Administrator')
    )
  );

DROP POLICY IF EXISTS historical_settlement_attribution_items_select ON driver_finance.historical_settlement_attribution_items;
CREATE POLICY historical_settlement_attribution_items_select
  ON driver_finance.historical_settlement_attribution_items FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );
DROP POLICY IF EXISTS historical_settlement_attribution_items_insert ON driver_finance.historical_settlement_attribution_items;
CREATE POLICY historical_settlement_attribution_items_insert
  ON driver_finance.historical_settlement_attribution_items FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
      AND identity.current_user_role() IN ('Owner', 'Administrator')
    )
  );

GRANT USAGE ON SCHEMA driver_finance TO ih35_app;
GRANT SELECT, INSERT ON driver_finance.historical_settlement_attributions TO ih35_app;
GRANT SELECT, INSERT ON driver_finance.historical_settlement_attribution_items TO ih35_app;
REVOKE UPDATE, DELETE, TRUNCATE ON driver_finance.historical_settlement_attributions FROM PUBLIC, ih35_app;
REVOKE UPDATE, DELETE, TRUNCATE ON driver_finance.historical_settlement_attribution_items FROM PUBLIC, ih35_app;

COMMENT ON TABLE driver_finance.historical_settlement_attributions IS
  'ACCT-F6350 WORM evidence linking an original posted settlement/payrun/JE to corrected settlement identities. It does not rewrite posted money; corrections are successor inserts.';
COMMENT ON COLUMN driver_finance.historical_settlement_attributions.allocated_net_cents IS
  'NULL for identity_only attribution. No historical monetary allocation is inferred by this migration.';
COMMENT ON TABLE driver_finance.historical_settlement_attribution_items IS
  'ACCT-F6350 WORM source-load and optional original settlement-line evidence for one historical attribution.';

COMMIT;
