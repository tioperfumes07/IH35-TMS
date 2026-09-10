import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const paramsSchema = z.object({ unitId: z.string().uuid() });
const querySchema = z.object({ operating_company_id: z.string().uuid() });

export async function registerUnitMaintenanceHistoryRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/units/:unitId/work-order-history", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const user = req.user;
    if (!user) return;
    const params = paramsSchema.safeParse(req.params);
    const query = querySchema.safeParse(req.query);
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });
    const companyId = query.data.operating_company_id;
    await assertCompanyMembership(user.uuid, companyId);

    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
      const result = await client.query(
        `SELECT w.id::text,
                w.display_id,
                w.status,
                COALESCE(w.opened_at, w.created_at)::text AS opened_at,
                w.closed_at::text,
                w.description,
                w.unit_id::text,
                u.unit_number,
                w.load_id::text,
                l.load_number,
                COALESCE(b.vendor_id, w.external_vendor_id)::text AS vendor_id,
                COALESCE(b.vendor_name, wv.vendor_name) AS vendor_name,
                COALESCE(b.amount_cents, 0) + COALESCE(e.amount_cents, 0) AS cost_cents,
                COALESCE(b.document_count, 0) + COALESCE(e.document_count, 0) AS financial_document_count,
                e.journal_entry_id::text AS journal_entry_id,
                COALESCE(b.gl_account_id, e.gl_account_id)::text AS gl_account_id,
                COALESCE(b.gl_account_name, e.gl_account_name) AS gl_account_name
           FROM maintenance.work_orders w
           JOIN mdata.units u ON u.id = w.unit_id
           LEFT JOIN mdata.loads l ON l.id = w.load_id AND l.operating_company_id = w.operating_company_id
           LEFT JOIN mdata.vendors wv
             ON wv.id = COALESCE(w.external_vendor_id, w.vendor_id)
            AND wv.operating_company_id = w.operating_company_id
           LEFT JOIN LATERAL (
             SELECT SUM(COALESCE(ab.amount_cents, 0))::bigint AS amount_cents,
                    COUNT(*)::int AS document_count,
                    (ARRAY_AGG(ab.mdata_vendor_id ORDER BY ab.created_at) FILTER (WHERE ab.mdata_vendor_id IS NOT NULL))[1] AS vendor_id,
                    (ARRAY_AGG(v.vendor_name ORDER BY ab.created_at) FILTER (WHERE v.vendor_name IS NOT NULL))[1] AS vendor_name,
                    (ARRAY_AGG(bl.account_id ORDER BY ab.created_at) FILTER (WHERE bl.account_id IS NOT NULL))[1] AS gl_account_id,
                    (ARRAY_AGG(ca.account_name ORDER BY ab.created_at) FILTER (WHERE ca.account_name IS NOT NULL))[1] AS gl_account_name
               FROM accounting.bills ab
               LEFT JOIN mdata.vendors v ON v.id = ab.mdata_vendor_id AND v.operating_company_id = ab.operating_company_id
               LEFT JOIN accounting.bill_lines bl ON bl.id = (SELECT id FROM accounting.bill_lines WHERE bill_id = ab.id ORDER BY line_sequence, id LIMIT 1)
               LEFT JOIN catalogs.accounts ca ON ca.id = bl.account_id AND ca.operating_company_id = ab.operating_company_id
              WHERE ab.operating_company_id = w.operating_company_id
                AND ab.linked_work_order_uuid = w.id
                AND ab.revoked_at IS NULL
           ) b ON true
           LEFT JOIN LATERAL (
             SELECT SUM(COALESCE(ae.total_amount_cents, 0))::bigint AS amount_cents,
                    COUNT(*)::int AS document_count,
                    (ARRAY_AGG(ae.journal_entry_id ORDER BY ae.created_at) FILTER (WHERE ae.journal_entry_id IS NOT NULL))[1] AS journal_entry_id,
                    (ARRAY_AGG(el.expense_account_uuid ORDER BY ae.created_at) FILTER (WHERE el.expense_account_uuid IS NOT NULL))[1] AS gl_account_id,
                    (ARRAY_AGG(ca.account_name ORDER BY ae.created_at) FILTER (WHERE ca.account_name IS NOT NULL))[1] AS gl_account_name
               FROM accounting.expenses ae
               LEFT JOIN accounting.expense_lines el ON el.id = (SELECT id FROM accounting.expense_lines WHERE expense_id = ae.id ORDER BY line_sequence, id LIMIT 1)
               LEFT JOIN catalogs.accounts ca ON ca.id = el.expense_account_uuid AND ca.operating_company_id = ae.operating_company_id
              WHERE ae.operating_company_id = w.operating_company_id
                AND ae.linked_work_order_uuid = w.id
                AND ae.status <> 'void'
           ) e ON true
          WHERE w.operating_company_id = $1::uuid
            AND w.unit_id = $2::uuid
          ORDER BY COALESCE(w.opened_at, w.created_at) DESC, w.id`,
        [companyId, params.data.unitId],
      );
      return { rows: result.rows, total_count: result.rows.length };
    });
  });
}
