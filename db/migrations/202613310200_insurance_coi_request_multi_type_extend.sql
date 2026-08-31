-- INSURANCE REQUEST FEATURE (owner-authorized 2026-08-31): one pipeline, two request types today
-- (COI for a customer, driver-add to the insurer), shaped so a third (unit-add) extends it later
-- with zero further schema change. Extends the EXISTING insurance.coi_request table additively --
-- no second table, per the owner's explicit instruction.
--
-- Idempotent. Reversible (drop the added columns/constraints; nothing here rewrites or drops
-- existing data).

BEGIN;

-- (1) customer_id becomes optional: a driver-add (or future unit-add) request has no customer.
--     Every existing row already has customer_id set (it was NOT NULL before this migration), so
--     this is a pure widening -- zero rows change.
ALTER TABLE insurance.coi_request ALTER COLUMN customer_id DROP NOT NULL;

-- (2) request_type: which of the (customer_coi | driver_add | unit_add) shapes this row is.
--     Defaults to the only shape that existed before this migration, so every existing row stays
--     valid with zero backfill.
ALTER TABLE insurance.coi_request
  ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'customer_coi';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'coi_request_type_check' AND conrelid = 'insurance.coi_request'::regclass
  ) THEN
    ALTER TABLE insurance.coi_request
      ADD CONSTRAINT coi_request_type_check
      CHECK (request_type IN ('customer_coi', 'driver_add', 'unit_add'));
  END IF;
END $$;

-- (3) driver_id / unit_id: the new request targets, nullable FKs mirroring customer_id's own shape.
ALTER TABLE insurance.coi_request
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES mdata.drivers(id),
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES mdata.units(id);

-- (4) Exactly one target column may be set, and it must match request_type -- never zero, never
--     more than one. Existing rows (request_type='customer_coi' by default, customer_id already
--     NOT NULL pre-migration, driver_id/unit_id both NULL) satisfy this with zero backfill.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'coi_request_target_check' AND conrelid = 'insurance.coi_request'::regclass
  ) THEN
    ALTER TABLE insurance.coi_request
      ADD CONSTRAINT coi_request_target_check
      CHECK (
        (request_type = 'customer_coi' AND customer_id IS NOT NULL AND driver_id IS NULL AND unit_id IS NULL)
        OR (request_type = 'driver_add' AND driver_id IS NOT NULL AND customer_id IS NULL AND unit_id IS NULL)
        OR (request_type = 'unit_add' AND unit_id IS NOT NULL AND customer_id IS NULL AND driver_id IS NULL)
      );
  END IF;
END $$;

-- (5) Lifecycle vocabulary (owner-specified 2026-08-31): requested -> sent -> acknowledged ->
--     issued/declined. The 5 original values stay valid -- no existing row is rewritten. 'sent' is
--     shared verbatim between both vocabularies (it already meant the same thing).
ALTER TABLE insurance.coi_request DROP CONSTRAINT IF EXISTS coi_request_status_check;
ALTER TABLE insurance.coi_request
  ADD CONSTRAINT coi_request_status_check
  CHECK (status = ANY (ARRAY[
    'pending', 'sent', 'received', 'expired', 'dismissed',
    'requested', 'acknowledged', 'issued', 'declined'
  ]));

-- (6) Send/acknowledge timestamps, the broker this pipeline sends to (owner-specified default:
--     eduardo@edsainsurance.com, overridable per-row so a changed broker never rewrites history),
--     and a back-link to the exact email.email_queue row a human's "Send" click enqueued -- the
--     log the owner asked for ("every send is logged").
ALTER TABLE insurance.coi_request
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS broker_email text NOT NULL DEFAULT 'eduardo@edsainsurance.com',
  ADD COLUMN IF NOT EXISTS email_queue_id uuid REFERENCES email.email_queue(id);

-- (7) docs.file_links.entity_type gets a new value, 'insurance_request', so the generated request
--     snapshot (and any returned COI/schedule document) can be hub-linked (Rule 14) to the request
--     itself, in addition to the existing customer/driver hub links. Additive widen, mirrors the
--     exact pattern DOC-01 used for expense/bill (chk_file_links_entity_type_widened_expense_bill).
ALTER TABLE docs.file_links DROP CONSTRAINT IF EXISTS chk_file_links_entity_type_widened_expense_bill;
ALTER TABLE docs.file_links
  ADD CONSTRAINT chk_file_links_entity_type_widened_expense_bill
  CHECK (entity_type = ANY (ARRAY[
    'driver', 'customer', 'vendor', 'unit', 'equipment', 'load', 'settlement', 'invoice',
    'tax_document', 'medical_card', 'background_check', 'fine', 'company_violation', 'drug_test',
    'hos_violation', 'dot_inspection', 'fuel_transaction', 'expense', 'bill', 'insurance_request'
  ]));

COMMIT;
