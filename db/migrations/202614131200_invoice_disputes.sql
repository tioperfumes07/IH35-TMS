-- 202614131200_invoice_disputes.sql
-- A/R INVOICE-LEVEL DISPUTE TRACKING (owner ruling 2026-09-12, verbatim):
--   "there might be an issue, we might have invoiced a certain amount but the customer states
--    another amount, due to a deduction etc. so the correct thing is put the amount as invoiced
--    and a dispute. this way the balance is open and we can figure and fix."
--   "we need to have an invoice dispute so we can keep track, maybe we entered the amount
--    incorrectly, well we edit, maybe the customer discounted for being late or fined for driver
--    not answering, etc."
--
-- The concrete trigger: when reconciling factoring to Faro, our billed invoice face (e.g. Load
-- 13586 / Mode Transportation Line Haul = $3,600.00, confirmed on Company_Settlement_5803.pdf)
-- differs from what the factor purchased / the customer will pay ($3,300.00). The WRONG fix is to
-- silently overwrite our invoice down to the collected number. The RIGHT fix (owner): keep the
-- invoice at the INVOICED face, open a DISPUTE for the $300 delta, and leave the A/R balance OPEN
-- so it is tracked until we edit (mis-entry) or record the real reason (late discount / driver
-- no-answer fine / short pay).
--
-- GRAIN: one row per dispute against one invoice. At most ONE open dispute per invoice.
-- CANONICAL-CHECK: no competing money ledger. accounting.invoices remains the one place the
-- receivable's FACE lives; this table NEVER mutates the invoice face or amount_open_cents. It is a
-- TRACKING record, not a GL posting -- resolution routes to the EXISTING posters (credit memo for a
-- real discount, an invoice edit for a mis-entry). No new GL math lives here.
--
-- Additive, idempotent, CREATE-only, void-not-delete, FORCED RLS. No existing data touched.

BEGIN;

CREATE TABLE IF NOT EXISTS accounting.invoice_disputes (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id      uuid NOT NULL REFERENCES org.companies(id),
  invoice_id                uuid NOT NULL REFERENCES accounting.invoices(id),
  -- The customer we billed. Defaulted from the invoice's customer_id at open time, but kept as its
  -- own FK so a caller can record a different disputing party if that is ever the real case.
  customer_id               uuid NULL REFERENCES mdata.customers(id),
  -- The disputed portion, always POSITIVE (the amount in question). Direction is implied by
  -- invoiced_amount_cents vs expected_amount_cents. This column NEVER reduces the invoice face.
  disputed_amount_cents     bigint NOT NULL,
  -- Snapshots at open time so the dispute is self-describing in an audit even if the invoice is
  -- later corrected: what WE billed vs what the customer / factor states.
  invoiced_amount_cents     bigint NOT NULL,
  expected_amount_cents     bigint NOT NULL,
  -- Owner's reasons, verbatim mapped: mis_entry (we entered it wrong -> we edit the invoice),
  -- customer_discount (customer discounted for being late), late_fine / driver_no_answer (a fine),
  -- short_pay (customer paid less, reason TBD), chargeback, other.
  reason_code               text NOT NULL,
  reason_text               text NULL,
  status                    text NOT NULL DEFAULT 'open',
  -- How the gap actually resolved: the invoice was corrected (mis-entry), a credit memo was issued
  -- (real discount/fine, through the EXISTING credit-memo poster), it was collected in full after
  -- all, written off, or closed with no change.
  resolution_type           text NULL,
  resolution_text           text NULL,
  resolution_amount_cents   bigint NULL,
  resolution_ref_id         uuid NULL,           -- e.g. the credit-memo id, when resolution_type='credit_memo'
  opened_at                 timestamptz NOT NULL DEFAULT now(),
  opened_by_user_id         uuid NULL REFERENCES identity.users(id),
  resolved_at               timestamptz NULL,
  resolved_by_user_id       uuid NULL REFERENCES identity.users(id),
  source_system             text NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_invoice_disputes_reason CHECK (reason_code IN (
    'mis_entry', 'customer_discount', 'late_fine', 'driver_no_answer', 'short_pay',
    'chargeback', 'other')),
  CONSTRAINT chk_invoice_disputes_status CHECK (status IN ('open', 'resolved', 'cancelled')),
  CONSTRAINT chk_invoice_disputes_resolution CHECK (
    resolution_type IS NULL OR resolution_type IN (
      'invoice_corrected', 'credit_memo', 'collected_in_full', 'written_off', 'no_change')),
  CONSTRAINT chk_invoice_disputes_amount_positive CHECK (disputed_amount_cents > 0),
  -- An open dispute has no resolution; a non-open dispute is resolved/cancelled with a timestamp.
  CONSTRAINT chk_invoice_disputes_resolved_state CHECK (
    (status = 'open'  AND resolved_at IS NULL AND resolution_type IS NULL)
    OR
    (status <> 'open' AND resolved_at IS NOT NULL)
  )
);

-- At most ONE open dispute per invoice (do not stack duplicates on the same receivable).
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_disputes_one_open
  ON accounting.invoice_disputes (invoice_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS ix_invoice_disputes_invoice
  ON accounting.invoice_disputes (invoice_id);
CREATE INDEX IF NOT EXISTS ix_invoice_disputes_queue
  ON accounting.invoice_disputes (operating_company_id, status);

-- WORM: never DELETE a financial row (matches accounting.broker_advances / ACCT-F141 pattern).
DO $$
BEGIN
  IF to_regprocedure('accounting.refuse_financial_row_delete()') IS NULL THEN
    RAISE EXCEPTION
      '202614131200: accounting.refuse_financial_row_delete() absent -- ACCT-F141 (202612220000) must exist first';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'accounting' AND c.relname = 'invoice_disputes'
       AND t.tgname = 'trg_worm_refuse_delete' AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.invoice_disputes
      FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();
  END IF;
END
$$;

DO $invoice_disputes_rls$
BEGIN
  EXECUTE 'ALTER TABLE accounting.invoice_disputes ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE accounting.invoice_disputes FORCE ROW LEVEL SECURITY';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'accounting' AND tablename = 'invoice_disputes'
      AND policyname = 'invoice_disputes_tenant'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY invoice_disputes_tenant ON accounting.invoice_disputes
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
  -- void-not-delete: SELECT/INSERT/UPDATE only. UPDATE is needed to resolve/cancel; DELETE never.
  EXECUTE 'GRANT SELECT, INSERT, UPDATE ON accounting.invoice_disputes TO ih35_app';
  EXECUTE 'REVOKE DELETE ON accounting.invoice_disputes FROM ih35_app';
  EXECUTE 'REVOKE ALL ON accounting.invoice_disputes FROM PUBLIC';
END
$invoice_disputes_rls$;

-- Feature flag: default OFF globally (migration-authoring law), USMCA override ON (Rule 50 --
-- all flags on for USMCA except QuickBooks). This is a non-QBO tracking capability.
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'INVOICE_DISPUTE_ENABLED',
  'A/R invoice-level dispute tracking (open/resolve). Keeps the invoice face + A/R balance OPEN and records the disputed portion + reason (mis-entry / customer discount / late fine / driver no-answer / short pay). No GL posting -- resolution routes to existing posters (credit memo, invoice edit). Default OFF; USMCA override ON per Rule 50.',
  false, 0
)
ON CONFLICT (flag_key) DO NOTHING;

DO $ffo$
DECLARE
  v_usmca uuid := '5c854333-6ea5-4faa-af31-67cb272fef80';
  v_setter uuid;
BEGIN
  IF to_regclass('lib.feature_flag_overrides') IS NULL THEN
    RAISE NOTICE 'INVOICE_DISPUTE_ENABLED: feature_flag_overrides absent -- skip override seed';
    RETURN;
  END IF;
  -- set_by_user_uuid is NOT NULL with an FK to identity.users. Prefer whoever last set an
  -- override; on a fresh DB (CI replay from 0001) there are none, so fall back to any user; if the
  -- DB has no users at all (pristine CI), defer the seed rather than fail the whole chain -- the
  -- live USMCA branch already carries this override, and the flag default (OFF) is the safe state
  -- until an override exists.
  SELECT set_by_user_uuid INTO v_setter
    FROM lib.feature_flag_overrides
   WHERE set_by_user_uuid IS NOT NULL
   ORDER BY set_at DESC
   LIMIT 1;
  IF v_setter IS NULL THEN
    SELECT id INTO v_setter FROM identity.users ORDER BY created_at LIMIT 1;
  END IF;

  IF v_setter IS NULL THEN
    RAISE NOTICE 'INVOICE_DISPUTE_ENABLED: no user present (pristine DB) -- USMCA override seed deferred to a live-data apply';
  ELSE
    INSERT INTO lib.feature_flag_overrides
      (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at, expires_at)
    VALUES
      (gen_random_uuid(), 'INVOICE_DISPUTE_ENABLED', v_usmca, NULL, true, v_setter, now(), NULL)
    ON CONFLICT (flag_key, operating_company_id)
      WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
      DO UPDATE SET enabled = true, set_at = now(), expires_at = NULL;
  END IF;
END
$ffo$;

-- Widen the polymorphic file-link entity types so dispute evidence (a customer email stating the
-- deduction, a rate-con correction) can attach to the dispute itself.
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
    ADD CONSTRAINT chk_file_links_entity_type_widened_invoice_dispute
    CHECK (entity_type IN (
      'driver', 'customer', 'vendor', 'unit', 'equipment', 'load', 'settlement', 'invoice',
      'tax_document', 'medical_card', 'background_check', 'fine', 'company_violation',
      'drug_test', 'hos_violation', 'dot_inspection', 'fuel_transaction', 'expense', 'bill',
      'broker_advance', 'invoice_dispute'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

COMMENT ON TABLE accounting.invoice_disputes IS
  'A/R invoice-level dispute (owner ruling 2026-09-12): when our invoiced face differs from what the customer/factor states, keep the invoice at the INVOICED amount and open a dispute for the delta so the A/R balance stays OPEN and tracked. A TRACKING record only -- never mutates the invoice face or amount_open_cents, posts NO GL. Resolution routes to the existing posters (credit memo / invoice correction).';
COMMENT ON COLUMN accounting.invoice_disputes.disputed_amount_cents IS
  'The disputed portion, always positive. Direction is implied by invoiced_amount_cents vs expected_amount_cents. Never reduces the invoice face.';

COMMIT;
