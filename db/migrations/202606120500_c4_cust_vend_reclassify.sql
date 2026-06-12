-- ============================================================
-- C4-CUST-VEND-REBUILD-RECLASSIFY
-- Additive migration: reclassification audit columns +
-- append-only reclassification log table.
-- NO destructive changes. Soft-delete/reversible only.
-- ============================================================

-- ── 1. Additive columns on mdata.customers ────────────────────────────────────
ALTER TABLE mdata.customers
  ADD COLUMN IF NOT EXISTS entity_classification   text,
  ADD COLUMN IF NOT EXISTS qbo_classification_ref  text,
  ADD COLUMN IF NOT EXISTS reclassified_at         timestamptz,
  ADD COLUMN IF NOT EXISTS reclassified_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merge_target_id         uuid REFERENCES mdata.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_duplicate            boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN mdata.customers.entity_classification   IS 'Free-text classification label (e.g. broker, direct, shipper). Settable per reclassify action.';
COMMENT ON COLUMN mdata.customers.qbo_classification_ref  IS 'QBO object ref captured at time of reclassification (for QBO-consistency audit).';
COMMENT ON COLUMN mdata.customers.reclassified_at         IS 'Timestamp of most recent reclassification.';
COMMENT ON COLUMN mdata.customers.is_duplicate            IS 'Soft-flagged as duplicate pending merge. Reversible.';

-- ── 2. Additive columns on mdata.vendors ─────────────────────────────────────
ALTER TABLE mdata.vendors
  ADD COLUMN IF NOT EXISTS entity_classification   text,
  ADD COLUMN IF NOT EXISTS qbo_classification_ref  text,
  ADD COLUMN IF NOT EXISTS reclassified_at         timestamptz,
  ADD COLUMN IF NOT EXISTS reclassified_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merge_target_id         uuid REFERENCES mdata.vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_duplicate            boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN mdata.vendors.entity_classification   IS 'Free-text classification label. Settable per reclassify action.';
COMMENT ON COLUMN mdata.vendors.qbo_classification_ref  IS 'QBO object ref captured at time of reclassification.';
COMMENT ON COLUMN mdata.vendors.reclassified_at         IS 'Timestamp of most recent reclassification.';
COMMENT ON COLUMN mdata.vendors.is_duplicate            IS 'Soft-flagged as duplicate pending merge. Reversible.';

-- ── 3. Append-only reclassification log ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS mdata.entity_reclassification_log (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid        NOT NULL,
  entity_table         text        NOT NULL CHECK (entity_table IN ('mdata.customers', 'mdata.vendors')),
  entity_id            uuid        NOT NULL,
  action               text        NOT NULL CHECK (action IN ('reclassify', 'flag_duplicate', 'unflag_duplicate', 'merge')),
  classification_before text,
  classification_after  text,
  qbo_id               text,
  reason               text,
  actor_user_id        uuid        REFERENCES identity.users(id) ON DELETE SET NULL,
  spine_event_id       uuid,
  occurred_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE mdata.entity_reclassification_log IS
  'Append-only audit log of every reclassify/merge/flag action. Never updated or deleted.';

CREATE INDEX IF NOT EXISTS idx_entity_reclassif_entity
  ON mdata.entity_reclassification_log (entity_table, entity_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_entity_reclassif_company
  ON mdata.entity_reclassification_log (operating_company_id, occurred_at DESC);

-- ── 4. updated_at triggers ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mdata.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_customers_updated_at'
      AND tgrelid = 'mdata.customers'::regclass
  ) THEN
    CREATE TRIGGER trg_customers_updated_at
      BEFORE UPDATE ON mdata.customers
      FOR EACH ROW EXECUTE FUNCTION mdata.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_vendors_updated_at'
      AND tgrelid = 'mdata.vendors'::regclass
  ) THEN
    CREATE TRIGGER trg_vendors_updated_at
      BEFORE UPDATE ON mdata.vendors
      FOR EACH ROW EXECUTE FUNCTION mdata.set_updated_at();
  END IF;
END $$;

-- ── 5. RLS — NULLIF pattern ───────────────────────────────────────────────────
ALTER TABLE mdata.entity_reclassification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reclassif_log_company_isolation ON mdata.entity_reclassification_log;
CREATE POLICY reclassif_log_company_isolation
  ON mdata.entity_reclassification_log
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

-- ── 6. Grants ─────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT ON mdata.entity_reclassification_log TO authenticated;
GRANT USAGE ON SCHEMA mdata TO authenticated;
