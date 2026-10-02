-- 202615220700_factoring_repurchase_due_events.sql
-- Lead ROUND 296 / 297 + owner (2026-10-02): "WHEN RECOURSE TIME ARRIVES IT MUST ASK, NOT RECOURSE AUTOMATICALLY."
--
-- The day-95 Repurchase Deadline is an OBLIGATION EVENT in the owner's decision queue, never a posting. A purchased
-- account (one factoring purchase line) still open on day 95 from its purchase date gets one row here, state
-- 'awaiting_owner'. The owner answers EXTEND (new due date; the row asks again then), CONFIRM REPURCHASE (the
-- repurchase posts later, when Faro's deduction / our payment is matched in Banking), or MARK COLLECTED (the customer
-- paid Faro). There is no default action, and this table holds no amount that posts: no JE, posting, bill or payment.
--
-- Stamped to operating company, factor (vendor), purchase, purchase line, invoice and customer — every column an FK,
-- same entity enforced by trigger. Append-only: never a delete; a decision is an UPDATE audited row by row.

BEGIN;

CREATE TABLE IF NOT EXISTS accounting.factoring_repurchase_due_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  factor_vendor_id uuid REFERENCES mdata.vendors(id),
  purchase_id uuid NOT NULL REFERENCES accounting.factoring_purchases(id),
  purchase_line_id uuid NOT NULL REFERENCES accounting.factoring_purchase_lines(id),
  invoice_id uuid NOT NULL REFERENCES accounting.invoices(id),
  customer_id uuid REFERENCES mdata.customers(id),
  purchase_date date NOT NULL,
  due_date date NOT NULL,
  gross_cents bigint NOT NULL CHECK (gross_cents >= 0),
  state text NOT NULL DEFAULT 'awaiting_owner'
    CHECK (state IN ('awaiting_owner', 'extended', 'repurchase_confirmed', 'marked_collected')),
  extended_to date,
  decided_by_user_id uuid REFERENCES identity.users(id),
  decided_at timestamptz,
  decision_note text,
  state_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT factoring_repurchase_due_events_one_per_line UNIQUE (purchase_line_id),
  CONSTRAINT factoring_repurchase_due_events_decided_has_actor CHECK (
    state = 'awaiting_owner' OR (decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL)
  ),
  CONSTRAINT factoring_repurchase_due_events_extend_has_date CHECK (
    state <> 'extended' OR (extended_to IS NOT NULL AND extended_to > due_date)
  )
);

CREATE INDEX IF NOT EXISTS factoring_repurchase_due_events_company_state_idx
  ON accounting.factoring_repurchase_due_events (operating_company_id, state, due_date);
CREATE INDEX IF NOT EXISTS factoring_repurchase_due_events_invoice_idx ON accounting.factoring_repurchase_due_events (invoice_id);
CREATE INDEX IF NOT EXISTS factoring_repurchase_due_events_customer_idx ON accounting.factoring_repurchase_due_events (customer_id);

-- Same entity on every stamp; the line must belong to the purchase.
CREATE OR REPLACE FUNCTION accounting.factoring_repurchase_due_event_same_entity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM accounting.factoring_purchase_lines l
    JOIN accounting.factoring_purchases p ON p.id = l.purchase_id
    WHERE l.id = NEW.purchase_line_id AND p.id = NEW.purchase_id
      AND l.operating_company_id = NEW.operating_company_id AND p.operating_company_id = NEW.operating_company_id
  ) THEN
    RAISE EXCEPTION 'factoring_repurchase_due_event: line % / purchase % not in company %', NEW.purchase_line_id, NEW.purchase_id, NEW.operating_company_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM accounting.invoices i WHERE i.id = NEW.invoice_id AND i.operating_company_id = NEW.operating_company_id) THEN
    RAISE EXCEPTION 'factoring_repurchase_due_event: invoice % is not in company %', NEW.invoice_id, NEW.operating_company_id;
  END IF;
  IF NEW.customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mdata.customers c WHERE c.id = NEW.customer_id AND c.operating_company_id = NEW.operating_company_id) THEN
    RAISE EXCEPTION 'factoring_repurchase_due_event: customer % is not in company %', NEW.customer_id, NEW.operating_company_id;
  END IF;
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND NEW.state IS DISTINCT FROM OLD.state THEN NEW.state_changed_at := now(); END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_factoring_repurchase_due_event_same_entity ON accounting.factoring_repurchase_due_events;
CREATE TRIGGER trg_factoring_repurchase_due_event_same_entity BEFORE INSERT OR UPDATE ON accounting.factoring_repurchase_due_events
  FOR EACH ROW EXECUTE FUNCTION accounting.factoring_repurchase_due_event_same_entity();

DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON accounting.factoring_repurchase_due_events;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.factoring_repurchase_due_events
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();

DROP TRIGGER IF EXISTS tg_audit_row_factoring_repurchase_due_events ON accounting.factoring_repurchase_due_events;
CREATE TRIGGER tg_audit_row_factoring_repurchase_due_events AFTER INSERT OR UPDATE OR DELETE ON accounting.factoring_repurchase_due_events
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

ALTER TABLE accounting.factoring_repurchase_due_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.factoring_repurchase_due_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS factoring_repurchase_due_events_company_isolation ON accounting.factoring_repurchase_due_events;
CREATE POLICY factoring_repurchase_due_events_company_isolation ON accounting.factoring_repurchase_due_events
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON accounting.factoring_repurchase_due_events TO ih35_app;

COMMIT;
