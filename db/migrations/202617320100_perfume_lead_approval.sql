-- PERFUME — lead approval (owner 2026-11-28 14:30 CT: "a lead cannot appear as a vendor or customer unless approved. this way the data
-- is only in one place and then transferred").
--
-- One company record (perfume.contact_companies) for every contact. Until the owner approves it, a company is a LEAD — it lists under
-- Leads only, whatever role an import or a research file gave it. Approving it (as customer / vendor / both) moves it to Customers /
-- Vendors; "Send back to leads" undoes that. Nothing is copied: the same row changes list.
--   * approved_at / approved_by — when and who approved it; NULL = a lead. Every approve / send-back also writes a perfume.lead_events
--     row (actions 'approved' / 'unapproved'), so the company's History shows it.
--   * Backfill: a company that already has business on file is approved now (its purchase history, a quote, a sales order, a vendor
--     price list or PO, a ScentsX customer / vendor link, a customer account, or the "Customer" category from the owner's customer
--     list). Everything else stays a lead for the owner to approve.
-- No new table; no money; no RLS change (the column rides the table's existing policies and grants).

BEGIN;

ALTER TABLE perfume.contact_companies ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE perfume.contact_companies ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES identity.users(id);
CREATE INDEX IF NOT EXISTS idx_contact_companies_approved ON perfume.contact_companies (approved_at) WHERE archived_at IS NULL;

WITH b AS (
  SELECT co.id FROM perfume.contact_companies co
   WHERE co.archived_at IS NULL AND co.approved_at IS NULL AND co.role IS NOT NULL
     AND (EXISTS (SELECT 1 FROM perfume.customer_purchase_history h WHERE h.company_id = co.id)
       OR EXISTS (SELECT 1 FROM perfume.quotes q WHERE q.company_id = co.id)
       OR EXISTS (SELECT 1 FROM perfume.sales_orders o WHERE o.company_id = co.id)
       OR EXISTS (SELECT 1 FROM perfume.vendors v WHERE v.company_id = co.id AND v.archived_at IS NULL
                   AND (EXISTS (SELECT 1 FROM perfume.price_lists pl WHERE pl.vendor_id = v.id)
                     OR EXISTS (SELECT 1 FROM perfume.purchase_orders p WHERE p.vendor_id = v.id)))
       OR EXISTS (SELECT 1 FROM scentsx.customer_links l WHERE l.contact_company_id = co.id AND l.voided_at IS NULL)
       OR EXISTS (SELECT 1 FROM perfume.vendors v JOIN scentsx.vendor_links l ON l.perfume_vendor_id = v.id
                   WHERE v.company_id = co.id AND l.voided_at IS NULL)
       OR EXISTS (SELECT 1 FROM perfume.customer_accounts a WHERE a.company_id = co.id)
       OR 'Customer' = ANY (coalesce(co.categories, '{}'::text[])))
), u AS (
  UPDATE perfume.contact_companies co SET approved_at = now() FROM b WHERE co.id = b.id RETURNING co.id, co.role
)
INSERT INTO perfume.lead_events (entity, entity_id, company_id, action, detail)
SELECT 'company', u.id, u.id, 'approved', jsonb_build_object('role', u.role, 'how', 'business on file (migration 202617320100)') FROM u;

COMMIT;
