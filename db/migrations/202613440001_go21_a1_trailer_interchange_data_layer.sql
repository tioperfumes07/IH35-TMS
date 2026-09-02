-- GO-21 dispatch defect register, section A1 (owner direct instruction 2026-09-02).
-- "The owner ran load 13508 on a broker's trailer and the software has nowhere to record it.
-- No %interchange% table exists. The load's only trailer fields are load_trailer_equipment_id
-- (an equipment-TYPE catalog) and trailer_type (text). The wizard picks assigned_trailer_unit_id
-- from mdata.units, which is the owned fleet. A non-owned trailer therefore cannot be represented
-- at all."
--
-- ABSOLUTELY NOT inserted into mdata.units -- that would assert ownership of an asset the company
-- does not own and pollute the fleet roster, unit-scoped maintenance, the insurance schedule, and
-- every unit report. Two new tables instead, under dispatch (operational, not fleet-master-data):
--
--   dispatch.non_owned_trailers    -- the physical trailer + the counterparty who owns it
--                                      (customer OR vendor, entity_type/entity_uuid discriminator,
--                                      the same shape accounting.journal_entry_postings already
--                                      uses for entity_type/entity_uuid -- migration 202612670000).
--   dispatch.trailer_interchanges  -- one load's custody of one non-owned trailer: receipt, return,
--                                      condition in/out, signed agreement (docs.files), and an
--                                      insurance.claim linkage mirroring safety.accident_liabilities.
--                                      insurance_claim_id -> insurance.claim(id) exactly (migration
--                                      202613400001) -- trailer interchange is an insured exposure.
--
-- Additive only, idempotent. FORCE RLS + 0065 grant pattern (SELECT/INSERT/UPDATE, never DELETE --
-- void-not-delete law). Append-only audit via the existing appendCrudAudit() helper at the
-- application layer (audit.crud_audit, already used throughout this codebase) -- no new audit
-- table invented.

BEGIN;

CREATE TABLE IF NOT EXISTS dispatch.non_owned_trailers (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id   uuid NOT NULL REFERENCES org.companies(id),
  trailer_number         text NOT NULL,
  trailer_type           text NULL,
  plate_number           text NULL,
  plate_state            text NULL,
  vin                    text NULL,
  counterparty_type      text NOT NULL,
  counterparty_id        uuid NOT NULL,
  notes                  text NULL,
  is_active              boolean NOT NULL DEFAULT true,
  voided_at              timestamptz NULL,
  voided_by_user_id      uuid NULL REFERENCES identity.users(id),
  void_reason            text NULL,
  is_sample_data         boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by_user_id     uuid NULL REFERENCES identity.users(id),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_non_owned_trailers_counterparty_type'
      AND conrelid = 'dispatch.non_owned_trailers'::regclass
  ) THEN
    ALTER TABLE dispatch.non_owned_trailers
      ADD CONSTRAINT chk_non_owned_trailers_counterparty_type
      CHECK (counterparty_type IN ('customer', 'vendor'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_non_owned_trailers_company
  ON dispatch.non_owned_trailers (operating_company_id)
  WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_non_owned_trailers_counterparty
  ON dispatch.non_owned_trailers (operating_company_id, counterparty_type, counterparty_id)
  WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS dispatch.trailer_interchanges (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id   uuid NOT NULL REFERENCES org.companies(id),
  load_id                uuid NOT NULL REFERENCES mdata.loads(id),
  non_owned_trailer_id   uuid NOT NULL REFERENCES dispatch.non_owned_trailers(id),
  received_from          text NULL,
  received_at            timestamptz NULL,
  condition_in           text NULL,
  returned_at            timestamptz NULL,
  condition_out          text NULL,
  agreement_document_id  uuid NULL REFERENCES docs.files(id) ON DELETE SET NULL,
  insurance_claim_id     uuid NULL REFERENCES insurance.claim(id),
  status                 text NOT NULL DEFAULT 'pending_receipt',
  voided_at              timestamptz NULL,
  voided_by_user_id      uuid NULL REFERENCES identity.users(id),
  void_reason            text NULL,
  is_sample_data         boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by_user_id     uuid NULL REFERENCES identity.users(id),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_trailer_interchanges_status'
      AND conrelid = 'dispatch.trailer_interchanges'::regclass
  ) THEN
    ALTER TABLE dispatch.trailer_interchanges
      ADD CONSTRAINT chk_trailer_interchanges_status
      CHECK (status IN ('pending_receipt', 'active', 'returned', 'closed'));
  END IF;
END $$;

-- One active (not yet returned/voided) interchange per load+trailer pair.
CREATE UNIQUE INDEX IF NOT EXISTS uq_trailer_interchange_active
  ON dispatch.trailer_interchanges (operating_company_id, load_id, non_owned_trailer_id)
  WHERE returned_at IS NULL AND voided_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_trailer_interchanges_load
  ON dispatch.trailer_interchanges (operating_company_id, load_id)
  WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_trailer_interchanges_trailer
  ON dispatch.trailer_interchanges (operating_company_id, non_owned_trailer_id)
  WHERE voided_at IS NULL;

DO $tinterchange_rls$
BEGIN
  IF to_regclass('dispatch.non_owned_trailers') IS NULL OR to_regclass('dispatch.trailer_interchanges') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE dispatch.non_owned_trailers ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE dispatch.non_owned_trailers FORCE ROW LEVEL SECURITY';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'dispatch' AND tablename = 'non_owned_trailers'
      AND policyname = 'non_owned_trailers_tenant'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY non_owned_trailers_tenant ON dispatch.non_owned_trailers
        FOR ALL
        USING (
          identity.is_lucia_bypass()
          OR operating_company_id::text = current_setting('app.operating_company_id', true)
        )
        WITH CHECK (
          identity.is_lucia_bypass()
          OR operating_company_id::text = current_setting('app.operating_company_id', true)
        )
    $policy$;
  END IF;
  EXECUTE 'GRANT SELECT, INSERT, UPDATE ON dispatch.non_owned_trailers TO ih35_app';
  EXECUTE 'REVOKE DELETE ON dispatch.non_owned_trailers FROM ih35_app';
  EXECUTE 'REVOKE ALL ON dispatch.non_owned_trailers FROM PUBLIC';

  EXECUTE 'ALTER TABLE dispatch.trailer_interchanges ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE dispatch.trailer_interchanges FORCE ROW LEVEL SECURITY';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'dispatch' AND tablename = 'trailer_interchanges'
      AND policyname = 'trailer_interchanges_tenant'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY trailer_interchanges_tenant ON dispatch.trailer_interchanges
        FOR ALL
        USING (
          identity.is_lucia_bypass()
          OR operating_company_id::text = current_setting('app.operating_company_id', true)
        )
        WITH CHECK (
          identity.is_lucia_bypass()
          OR operating_company_id::text = current_setting('app.operating_company_id', true)
        )
    $policy$;
  END IF;
  EXECUTE 'GRANT SELECT, INSERT, UPDATE ON dispatch.trailer_interchanges TO ih35_app';
  EXECUTE 'REVOKE DELETE ON dispatch.trailer_interchanges FROM ih35_app';
  EXECUTE 'REVOKE ALL ON dispatch.trailer_interchanges FROM PUBLIC';
END
$tinterchange_rls$;

COMMENT ON TABLE dispatch.non_owned_trailers IS
  'GO-21 A1 -- a trailer the company does NOT own (broker/customer/vendor-provided). Never mdata.units -- that table is owned-fleet-only.';
COMMENT ON TABLE dispatch.trailer_interchanges IS
  'GO-21 A1 -- one load''s custody of one non-owned trailer: receipt, return, condition, signed agreement, insured-exposure linkage. Void-not-delete; append-only audit via appendCrudAudit().';
COMMENT ON COLUMN dispatch.non_owned_trailers.counterparty_id IS
  'Paired with counterparty_type (customer|vendor) -- polymorphic, no direct FK possible on one column, same discriminator shape as accounting.journal_entry_postings.entity_type/entity_uuid (migration 202612670000).';
COMMENT ON COLUMN dispatch.trailer_interchanges.insurance_claim_id IS
  'Mirrors safety.accident_liabilities.insurance_claim_id -> insurance.claim(id) exactly (migration 202613400001) -- trailer interchange is an insured exposure.';

COMMIT;
