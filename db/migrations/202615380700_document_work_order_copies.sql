-- 202615380700_document_work_order_copies.sql
-- U16 (owner UI register 2026-10-03, CC-2) — "a stored copy of the work order opens from the document".
-- A bill or expense linked to a work order showed only a link to the LIVE work order, which keeps changing after the bill
-- is entered (lines added, costs corrected, status moved). The document needs the work order AS IT WAS when it was linked.
--
-- accounting.document_work_order_copies keeps one copy per (document, work order): the work-order row, the unit / driver /
-- vendor / company fields the printed work order shows, and its line totals and lines — exactly the inputs of the WO
-- letter renderer, so the stored copy prints with the same template as the live one.
--
-- ONE writer for every path: AFTER INSERT / UPDATE triggers on accounting.bills, bill_lines, expenses and expense_lines
-- capture the copy the moment a work-order link is written (header linked_work_order_uuid, or a line's
-- linked_work_order_uuid / linked_wo_line_uuid). Five services write these links today (bills, checks, the maintenance
-- poster, the two-section WO service, expenses) — none of them has to remember to call anything.
--   * a copy is never replaced: re-linking the same work order keeps the first copy (ON CONFLICT DO NOTHING)
--   * a work order of another company is REFUSED (a document never links across companies)
--   * only print fields are copied for people (driver name + phone), never the whole driver row
-- Backfill: existing links excluding the frozen companies (TRANSP, TRK). USMCA has 0 linked bills / expenses today.

BEGIN;

SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '15s';

CREATE TABLE IF NOT EXISTS accounting.document_work_order_copies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  source_kind text NOT NULL CHECK (source_kind IN ('bill', 'expense')),
  source_id uuid NOT NULL,
  work_order_id uuid NOT NULL REFERENCES maintenance.work_orders(id),
  work_order_display_id text,
  payload jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  captured_by_user_id uuid,
  is_sample_data boolean NOT NULL DEFAULT false,
  CONSTRAINT document_work_order_copies_one_per_link UNIQUE (source_kind, source_id, work_order_id)
);

CREATE INDEX IF NOT EXISTS idx_document_work_order_copies_source
  ON accounting.document_work_order_copies (operating_company_id, source_kind, source_id);

ALTER TABLE accounting.document_work_order_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.document_work_order_copies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_work_order_copies_company_isolation ON accounting.document_work_order_copies;
CREATE POLICY document_work_order_copies_company_isolation ON accounting.document_work_order_copies
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

GRANT SELECT, INSERT ON accounting.document_work_order_copies TO ih35_app;

-- WORM: a stored copy is evidence of what the document was entered against; never deleted.
DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON accounting.document_work_order_copies;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.document_work_order_copies
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();
DROP TRIGGER IF EXISTS trg_audit_document_work_order_copies ON accounting.document_work_order_copies;
CREATE TRIGGER trg_audit_document_work_order_copies AFTER INSERT OR UPDATE OR DELETE ON accounting.document_work_order_copies
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

-- The WO letter's inputs, as of now. NULL when the work order is not this company's.
CREATE OR REPLACE FUNCTION accounting.work_order_copy_payload(p_work_order_id uuid, p_company_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
  SELECT jsonb_build_object(
    'wo', to_jsonb(w),
    'company', (SELECT jsonb_build_object('legal_name', c.legal_name, 'short_name', c.short_name, 'tax_id', c.tax_id)
                  FROM org.companies c WHERE c.id = p_company_id),
    'unit', (SELECT jsonb_build_object('unit_number', u.unit_number, 'make', u.make, 'model', u.model, 'vin', u.vin)
               FROM mdata.units u
              WHERE u.id = w.unit_id AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = p_company_id),
    'driver', (SELECT jsonb_build_object('first_name', d.first_name, 'last_name', d.last_name, 'phone', d.phone)
                 FROM mdata.drivers d
                WHERE d.id = w.driver_id
                  AND (d.operating_company_id = p_company_id
                       OR EXISTS (SELECT 1 FROM mdata.driver_company_authorizations a
                                   WHERE a.driver_id = d.id AND a.company_id = p_company_id
                                     AND a.is_authorized = true AND a.deactivated_at IS NULL))),
    'vendor', (SELECT jsonb_build_object('vendor_name', v.vendor_name, 'phone', v.phone, 'address_line1', v.address_line1,
                                         'address_line2', v.address_line2, 'city', v.city, 'state', v.state,
                                         'postal_code', v.postal_code)
                 FROM mdata.vendors v
                WHERE v.id = COALESCE(w.external_vendor_id, w.vendor_id) AND v.operating_company_id = p_company_id),
    'line_totals', COALESCE((SELECT jsonb_object_agg(t.line_type, t.total)
                               FROM (SELECT l.line_type, SUM(l.total_cost) AS total
                                       FROM maintenance.work_order_lines l
                                      WHERE l.work_order_uuid = w.id AND l.voided_at IS NULL
                                      GROUP BY l.line_type) t), '{}'::jsonb),
    'lines', COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM maintenance.work_order_lines l
                        WHERE l.work_order_uuid = w.id AND l.voided_at IS NULL), '[]'::jsonb)
  )
  FROM maintenance.work_orders w
  WHERE w.id = p_work_order_id AND w.operating_company_id = p_company_id
$fn$;

CREATE OR REPLACE FUNCTION accounting.capture_work_order_copy(
  p_company_id uuid, p_source_kind text, p_source_id uuid, p_work_order_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE
  v_payload jsonb;
  v_actor uuid;
BEGIN
  IF p_work_order_id IS NULL OR p_source_id IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM accounting.document_work_order_copies
              WHERE source_kind = p_source_kind AND source_id = p_source_id AND work_order_id = p_work_order_id) THEN
    RETURN;
  END IF;
  v_payload := accounting.work_order_copy_payload(p_work_order_id, p_company_id);
  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'U16: % % links work order % which is not a work order of company %',
      p_source_kind, p_source_id, p_work_order_id, p_company_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  v_actor := CASE WHEN current_setting('app.current_user_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  THEN current_setting('app.current_user_id', true)::uuid END;
  INSERT INTO accounting.document_work_order_copies
    (operating_company_id, source_kind, source_id, work_order_id, work_order_display_id, payload, captured_by_user_id)
  VALUES (p_company_id, p_source_kind, p_source_id, p_work_order_id, v_payload -> 'wo' ->> 'display_id', v_payload, v_actor)
  ON CONFLICT (source_kind, source_id, work_order_id) DO NOTHING;
END;
$fn$;

-- One trigger function for all four tables: which document, which company, which work order.
CREATE OR REPLACE FUNCTION accounting.tg_capture_work_order_copy() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE
  v_company uuid;
  v_wo uuid;
BEGIN
  IF TG_TABLE_NAME = 'bills' THEN
    PERFORM accounting.capture_work_order_copy(NEW.operating_company_id, 'bill', NEW.id, NEW.linked_work_order_uuid);
  ELSIF TG_TABLE_NAME = 'expenses' THEN
    PERFORM accounting.capture_work_order_copy(NEW.operating_company_id, 'expense', NEW.id, NEW.linked_work_order_uuid);
  ELSIF TG_TABLE_NAME = 'bill_lines' THEN
    IF NEW.linked_wo_line_uuid IS NOT NULL THEN
      SELECT b.operating_company_id INTO v_company FROM accounting.bills b WHERE b.id = NEW.bill_id;
      SELECT l.work_order_uuid INTO v_wo FROM maintenance.work_order_lines l WHERE l.uuid = NEW.linked_wo_line_uuid;
      PERFORM accounting.capture_work_order_copy(v_company, 'bill', NEW.bill_id, v_wo);
    END IF;
  ELSIF TG_TABLE_NAME = 'expense_lines' THEN
    v_wo := NEW.linked_work_order_uuid;
    IF v_wo IS NULL AND NEW.linked_wo_line_uuid IS NOT NULL THEN
      SELECT l.work_order_uuid INTO v_wo FROM maintenance.work_order_lines l WHERE l.uuid = NEW.linked_wo_line_uuid;
    END IF;
    IF v_wo IS NOT NULL THEN
      SELECT e.operating_company_id INTO v_company FROM accounting.expenses e WHERE e.id = NEW.expense_id;
      PERFORM accounting.capture_work_order_copy(v_company, 'expense', NEW.expense_id, v_wo);
    END IF;
  END IF;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_capture_work_order_copy ON accounting.bills;
CREATE TRIGGER trg_capture_work_order_copy AFTER INSERT OR UPDATE OF linked_work_order_uuid ON accounting.bills
  FOR EACH ROW WHEN (NEW.linked_work_order_uuid IS NOT NULL) EXECUTE FUNCTION accounting.tg_capture_work_order_copy();
DROP TRIGGER IF EXISTS trg_capture_work_order_copy ON accounting.expenses;
CREATE TRIGGER trg_capture_work_order_copy AFTER INSERT OR UPDATE OF linked_work_order_uuid ON accounting.expenses
  FOR EACH ROW WHEN (NEW.linked_work_order_uuid IS NOT NULL) EXECUTE FUNCTION accounting.tg_capture_work_order_copy();
DROP TRIGGER IF EXISTS trg_capture_work_order_copy ON accounting.bill_lines;
CREATE TRIGGER trg_capture_work_order_copy AFTER INSERT OR UPDATE OF linked_wo_line_uuid ON accounting.bill_lines
  FOR EACH ROW WHEN (NEW.linked_wo_line_uuid IS NOT NULL) EXECUTE FUNCTION accounting.tg_capture_work_order_copy();
DROP TRIGGER IF EXISTS trg_capture_work_order_copy ON accounting.expense_lines;
CREATE TRIGGER trg_capture_work_order_copy AFTER INSERT OR UPDATE OF linked_work_order_uuid, linked_wo_line_uuid ON accounting.expense_lines
  FOR EACH ROW WHEN (NEW.linked_work_order_uuid IS NOT NULL OR NEW.linked_wo_line_uuid IS NOT NULL)
  EXECUTE FUNCTION accounting.tg_capture_work_order_copy();

-- Backfill existing links (frozen companies excluded). Same function; a cross-company link is skipped here, not raised,
-- so a historical defect cannot block the migration — those are counted by the U16 guard instead.
INSERT INTO accounting.document_work_order_copies
  (operating_company_id, source_kind, source_id, work_order_id, work_order_display_id, payload)
SELECT x.company_id, x.kind, x.doc_id, x.wo_id, p.payload -> 'wo' ->> 'display_id', p.payload
  FROM (
    SELECT b.operating_company_id AS company_id, 'bill'::text AS kind, b.id AS doc_id, b.linked_work_order_uuid AS wo_id
      FROM accounting.bills b WHERE b.linked_work_order_uuid IS NOT NULL
    UNION
    SELECT b.operating_company_id, 'bill', b.id, l.work_order_uuid
      FROM accounting.bill_lines bl
      JOIN accounting.bills b ON b.id = bl.bill_id
      JOIN maintenance.work_order_lines l ON l.uuid = bl.linked_wo_line_uuid
    UNION
    SELECT e.operating_company_id, 'expense', e.id, e.linked_work_order_uuid
      FROM accounting.expenses e WHERE e.linked_work_order_uuid IS NOT NULL
    UNION
    SELECT e.operating_company_id, 'expense', e.id, COALESCE(el.linked_work_order_uuid, l.work_order_uuid)
      FROM accounting.expense_lines el
      JOIN accounting.expenses e ON e.id = el.expense_id
      LEFT JOIN maintenance.work_order_lines l ON l.uuid = el.linked_wo_line_uuid
     WHERE COALESCE(el.linked_work_order_uuid, l.work_order_uuid) IS NOT NULL
  ) x
  CROSS JOIN LATERAL (SELECT accounting.work_order_copy_payload(x.wo_id, x.company_id) AS payload) p
 WHERE p.payload IS NOT NULL
   AND x.company_id NOT IN (SELECT id FROM org.companies WHERE code IN ('TRANSP', 'TRK'))
ON CONFLICT (source_kind, source_id, work_order_id) DO NOTHING;

COMMENT ON TABLE accounting.document_work_order_copies IS 'U16: the work order as it was when a bill / expense was linked to it (WO letter inputs). Captured by trg_capture_work_order_copy on bills, bill_lines, expenses, expense_lines. Never replaced, never deleted.';

COMMIT;
