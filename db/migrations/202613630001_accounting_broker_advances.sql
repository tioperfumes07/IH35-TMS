-- 202613630001_accounting_broker_advances.sql
-- SET-24 (owner order 2026-09-04). How this works at this company, owner-confirmed:
--   - A BROKER sends an advance against a specific load -- for diesel, driver pay, or a repair
--     when cash is tight. Drivers are B1 COMPANY drivers, not owner-operators, so fuel is always a
--     company cost; the money reaching the driver (a Comchek) is a disbursement instrument, never
--     driver pay and never a driver debt.
--   - At delivery the FACTORING COMPANY purchases the receivable and advances the DIFFERENCE. The
--     invoice face stays the full rate; the broker prepaid part of it; the factor funds the rest.
--   - So a broker advance is a PARTIAL PAYMENT AGAINST THAT LOAD'S RECEIVABLE. It reduces what the
--     factor purchases. It NEVER reduces the invoice face and NEVER creates a driver liability.
--
-- accounting.invoices.broker_advance_applied_cents already exists live (migration 202609100090,
-- confirmed via information_schema this session) but nothing has ever written to it -- read in two
-- places (proforma-mint-on-first-pickup.ts's existence check, cash-flow.service.ts's remaining-
-- amount calc), written by none. This migration adds the table that RECORDS the advance receipt
-- (who sent it, why, the required instrument+reference, the amount) so a real writer can populate
-- that column instead of it sitting as an unused column forever.
--
-- Grain: one row per advance RECEIPT. The resulting spend (fuel bought with the Comchek) is its
-- own accounting.expenses row via the EXISTING expense path (load_id-attributed, per block 01's
-- Rung-1 direct trace) -- this table does not duplicate that; it records only the money coming IN
-- against the receivable, never the spend going out.
--
-- CANONICAL-CHECK: no competing money ledger. accounting.invoices remains the one place the
-- receivable's face amount lives; accounting.expenses remains the one place the spend lives; this
-- table is the one place the broker's prepayment against that receivable is recorded, feeding
-- accounting.invoices.broker_advance_applied_cents (additive, never overwritten to a smaller
-- number) as its only downstream effect on another table's money column.
--
-- Additive, idempotent, no data touched.

BEGIN;

CREATE TABLE IF NOT EXISTS accounting.broker_advances (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id   uuid NOT NULL REFERENCES org.companies(id),
  load_id                uuid NOT NULL REFERENCES mdata.loads(id),
  -- "who sent it: the broker/customer, as a real FK, not free text." A load's own customer_id is
  -- the natural default (the broker who booked the load), but this is its own column, not a join
  -- through mdata.loads, so a caller can record a DIFFERENT sender if that is ever the real case.
  customer_id            uuid NOT NULL REFERENCES mdata.customers(id),
  -- "category: advance received (diesel / driver pay / repair -- the reason it was sent)."
  category               text NOT NULL,
  -- "instrument and reference: Comchek number / EFTPS / wire reference. Required, never prefilled."
  instrument_type        text NOT NULL,
  instrument_reference   text NOT NULL,
  amount_cents           bigint NOT NULL,
  received_at            timestamptz NOT NULL,
  notes                  text NULL,
  -- Set once this advance's amount has been folded into accounting.invoices.
  -- broker_advance_applied_cents (either immediately, if a live invoice already exists for the
  -- load, or later when the invoice is first minted). NULL means "received but not yet applied to
  -- an invoice" -- an honest, expected state for an advance that arrives before first pickup mints
  -- the proforma, not an error.
  applied_to_invoice_id  uuid NULL REFERENCES accounting.invoices(id),
  applied_at             timestamptz NULL,
  voided_at              timestamptz NULL,
  void_reason            text NULL,
  voided_by_user_id      uuid NULL REFERENCES identity.users(id),
  created_by_user_id     uuid NULL REFERENCES identity.users(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_broker_advances_category
    CHECK (category IN ('diesel', 'driver_pay', 'repair', 'other')),
  CONSTRAINT chk_broker_advances_amount_positive CHECK (amount_cents > 0),
  -- "never prefilled" is a UI rule this constraint backs at the schema level: an empty-string
  -- instrument reference is refused the same as a NULL one would be.
  CONSTRAINT chk_broker_advances_instrument_reference_not_blank
    CHECK (btrim(instrument_reference) <> ''),
  CONSTRAINT chk_broker_advances_applied_state
    CHECK ((applied_to_invoice_id IS NULL) = (applied_at IS NULL))
);

CREATE INDEX IF NOT EXISTS ix_broker_advances_load
  ON accounting.broker_advances (load_id);
CREATE INDEX IF NOT EXISTS ix_broker_advances_unapplied
  ON accounting.broker_advances (operating_company_id, load_id)
  WHERE applied_to_invoice_id IS NULL AND voided_at IS NULL;

DO $$
BEGIN
  IF to_regprocedure('accounting.refuse_financial_row_delete()') IS NULL THEN
    RAISE EXCEPTION
      '202613630001: accounting.refuse_financial_row_delete() absent -- ACCT-F141 (202612220000) must exist first';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'accounting' AND c.relname = 'broker_advances'
       AND t.tgname = 'trg_worm_refuse_delete' AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.broker_advances
      FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();
  END IF;
END
$$;

DO $broker_advances_rls$
BEGIN
  EXECUTE 'ALTER TABLE accounting.broker_advances ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE accounting.broker_advances FORCE ROW LEVEL SECURITY';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'accounting' AND tablename = 'broker_advances'
      AND policyname = 'broker_advances_tenant'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY broker_advances_tenant ON accounting.broker_advances
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
  -- void-not-delete: never DELETE, void via voided_at/void_reason.
  EXECUTE 'GRANT SELECT, INSERT, UPDATE ON accounting.broker_advances TO ih35_app';
  EXECUTE 'REVOKE DELETE ON accounting.broker_advances FROM ih35_app';
  EXECUTE 'REVOKE ALL ON accounting.broker_advances FROM PUBLIC';
END
$broker_advances_rls$;

-- docs.file_links widen -- "receipt upload to docs.files, linked to the load." Reuses the existing
-- polymorphic file-link mechanism (CLAUDE.md §8) rather than a new upload path.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'docs'
      AND rel.relname = 'file_links'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%entity_type%'
  LOOP
    EXECUTE format('ALTER TABLE docs.file_links DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE docs.file_links
    ADD CONSTRAINT chk_file_links_entity_type_widened_broker_advance
    CHECK (entity_type IN (
      'driver', 'customer', 'vendor', 'unit', 'equipment', 'load', 'settlement', 'invoice',
      'tax_document', 'medical_card', 'background_check', 'fine', 'company_violation',
      'drug_test', 'hos_violation', 'dot_inspection', 'fuel_transaction', 'expense', 'bill',
      'broker_advance'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

COMMENT ON TABLE accounting.broker_advances IS
  'A broker-sent advance against a specific load''s receivable (diesel / driver pay / repair), disbursed via Comchek/EFT/wire. A PARTIAL PAYMENT against the receivable the factor will later purchase -- never a driver liability (drivers are B1 company drivers), never a reduction of the invoice face. Nets into accounting.invoices.broker_advance_applied_cents when a live invoice exists (immediately) or when one is first minted (at mint time, summing any unapplied rows for the load).';
COMMENT ON COLUMN accounting.broker_advances.applied_to_invoice_id IS
  'NULL = received but not yet folded into an invoice''s broker_advance_applied_cents -- an honest, expected state for an advance that arrives before first pickup mints the proforma, not an error.';

COMMIT;
