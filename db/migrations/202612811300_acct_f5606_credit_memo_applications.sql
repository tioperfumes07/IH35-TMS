BEGIN;

-- ACCT-F5606 — accounting.credit_memo_applications: the AR mirror of the existing
-- accounting.vendor_credit_applications junction table (migration 202607170000). Tracks which
-- invoices each AR credit memo was applied to. accounting.credit_memos already exists (has its own
-- issue_date/amount_cents/amount_applied_cents/voided_at columns) but had zero application/apply
-- path anywhere in the product (LV-CREDITMEMO-NOPATH) -- this is the schema half of building one,
-- mirroring the AP side's proven shape column-for-column, index-for-index, RLS-for-RLS, and closing
-- the gaps a migration-guard review found the AP sibling itself still carries (audit trigger present
-- on the sibling via the 202612770000 sweep, WORM/composite-FK/lucia-bypass NOT present on it) so
-- this table ships MORE hardened than the pattern it mirrors, not merely equal to it.
--
-- CANONICAL-CHECK: credit_memo_applications. No existing table tracks per-invoice AR credit-memo
-- application history. accounting.credit_memos itself only carries an aggregate
-- amount_applied_cents; accounting.payment_applications is the PAYMENT-to-invoice junction, a
-- distinct concept. accounting.vendor_credit_applications is the AP-side analog for bills, not
-- invoices. No collision.
--
-- NO GL posting — marks QBO-parity data only, exactly like the AP side. Posting rides the existing
-- invoice/payment GL chain when enabled. amount_applied_cents on the credit memo itself is kept in
-- sync via the routes layer, same as vendor_credits.amount_applied_cents.
--
-- KNOWN FOLLOW-ON, NOT this migration's scope: accounting.invoices.amount_open_cents is a GENERATED
-- column (total_cents - amount_paid_cents, migration 0123) with no knowledge of credit-memo
-- applications, so AR aging (ar-aging.service.ts) will not yet net an applied credit memo out of a
-- customer's reported balance. The routes layer (credit-memos.routes.ts) already computes the TRUE
-- remaining balance correctly for its own over-apply guard by summing this table directly; AR aging
-- doing the same is a separate, future fix against a different consumer, tracked on the board.

-- Same-opco composite-FK prerequisite (P43/P44 pattern, 202612512000): a (id, operating_company_id)
-- unique index on each parent this junction references, so the FK below can enforce that a credit
-- memo can never be applied to an invoice belonging to a DIFFERENT entity at the database level, not
-- only in application code.
CREATE UNIQUE INDEX IF NOT EXISTS credit_memos_id_operating_company_uidx
  ON accounting.credit_memos (id, operating_company_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_id_operating_company_uidx
  ON accounting.invoices (id, operating_company_id);

CREATE TABLE IF NOT EXISTS accounting.credit_memo_applications (
  id                     uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id   uuid          NOT NULL REFERENCES org.companies(id),
  credit_memo_id         uuid          NOT NULL,
  invoice_id             uuid          NOT NULL,
  applied_cents          bigint        NOT NULL CHECK (applied_cents > 0),
  applied_at             timestamptz   NOT NULL DEFAULT now(),
  applied_by_user_id     uuid          REFERENCES identity.users(id),
  voided_at              timestamptz,
  voided_by_user_id      uuid          REFERENCES identity.users(id),
  voided_reason          text,
  idempotency_key        text
);

ALTER TABLE accounting.credit_memo_applications
  ADD CONSTRAINT credit_memo_applications_credit_memo_same_company_fk
  FOREIGN KEY (credit_memo_id, operating_company_id)
  REFERENCES accounting.credit_memos (id, operating_company_id);

ALTER TABLE accounting.credit_memo_applications
  ADD CONSTRAINT credit_memo_applications_invoice_same_company_fk
  FOREIGN KEY (invoice_id, operating_company_id)
  REFERENCES accounting.invoices (id, operating_company_id);

COMMENT ON COLUMN accounting.credit_memo_applications.idempotency_key IS
  'Client-supplied key making credit-memo application safe to retry, mirroring '
  'vendor_credit_applications.idempotency_key (202607750000). NULL allowed; new writes should '
  'always send one.';

CREATE INDEX IF NOT EXISTS idx_cma_credit_memo
  ON accounting.credit_memo_applications(operating_company_id, credit_memo_id)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cma_invoice
  ON accounting.credit_memo_applications(operating_company_id, invoice_id)
  WHERE voided_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_memo_app_idempotency
  ON accounting.credit_memo_applications (operating_company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND voided_at IS NULL;

ALTER TABLE accounting.credit_memo_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.credit_memo_applications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cma_company_scope ON accounting.credit_memo_applications;
CREATE POLICY cma_company_scope ON accounting.credit_memo_applications
  USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

-- Lucia-bypass companion SELECT policy (202611060000's pattern) -- without this, an authorized
-- break-glass audit read (app.bypass_rls='lucia') sees a confident, wrong "0 rows" instead of the
-- real applications on this table. 202611060000's own header names accounting.vendor_credit_applications
-- as one of the six tables that produced exactly this bug before being fixed; this table gets the
-- companion policy from birth instead of needing the same fix retrofitted later.
DROP POLICY IF EXISTS cma_lucia_bypass ON accounting.credit_memo_applications;
CREATE POLICY cma_lucia_bypass ON accounting.credit_memo_applications
  FOR SELECT TO ih35_app USING (identity.is_lucia_bypass());

GRANT USAGE ON SCHEMA accounting TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.credit_memo_applications TO ih35_app;

-- Audit trigger (same schema-agnostic audit.tg_audit_row() the 202612770000 sweep attached to the AP
-- sibling vendor_credit_applications) -- "who applied this credit memo, and who reversed it?" must
-- be answerable from the audit trail from this table's first row, not retrofitted later.
DROP TRIGGER IF EXISTS tg_audit_row_credit_memo_applications ON accounting.credit_memo_applications;
CREATE TRIGGER tg_audit_row_credit_memo_applications
  AFTER INSERT OR UPDATE OR DELETE ON accounting.credit_memo_applications
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

-- WORM (void-not-delete), production-scoped exactly like ACCT-F269 (202612430000): a BEFORE DELETE
-- refusal trigger plus REVOKE DELETE, both installed together because a trigger alone only RECORDS a
-- delete (via tg_audit_row above) while accounting.refuse_financial_row_delete() actually REFUSES
-- one. Guarded by current_database()='neondb' so CI's ephemeral database (where fixture teardown
-- issues real DELETEs) is unaffected -- this table carries real applied_cents; the evidence of which
-- invoice a credit memo reduced must never be destroyable, only voided.
DO $$
BEGIN
  IF current_database() <> 'neondb' THEN
    RAISE NOTICE 'ACCT-F5606: database is % (not production) — DELETE-blocking not installed; fixture teardown preserved', current_database();
    RETURN;
  END IF;

  IF to_regprocedure('accounting.refuse_financial_row_delete()') IS NULL THEN
    RAISE EXCEPTION 'ACCT-F5606: accounting.refuse_financial_row_delete() is absent — ACCT-F141 (202612220000) must be applied first';
  END IF;

  DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON accounting.credit_memo_applications;
  CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.credit_memo_applications
    FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();
  REVOKE DELETE ON accounting.credit_memo_applications FROM ih35_app;

  RAISE NOTICE 'ACCT-F5606: accounting.credit_memo_applications is now WORM (refuse-trigger + REVOKE DELETE)';
END
$$;

COMMIT;
