-- CUST-F5974 — preserve historical contacts on an archived customer profile without weakening
-- active-only customer picker/list RLS. customer_contacts has no operating_company_id of its own;
-- its SELECT policy historically joined mdata.customers, whose FORCE-RLS policy hides deactivated
-- parents. Resolve the parent through the existing same-company SECURITY DEFINER function and the
-- request's explicitly pinned company GUC. INSERT/UPDATE policies remain unchanged.

BEGIN;

DROP POLICY IF EXISTS cc_select ON mdata.customer_contacts;
CREATE POLICY cc_select ON mdata.customer_contacts
  FOR SELECT TO ih35_app
  USING (
    EXISTS (
      SELECT 1
      FROM mdata.get_customer_same_company(
        customer_contacts.customer_uuid,
        NULLIF(current_setting('app.operating_company_id', true), '')::uuid
      ) c
    )
  );

COMMIT;
