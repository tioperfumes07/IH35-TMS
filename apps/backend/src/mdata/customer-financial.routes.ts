import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { listAttachments } from "../documents/attachments.service.js";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerCustomerFinancialSummaryRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/customers/:id/financial-summary", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const customerId = params.data.id;
    const companyId = query.data.operating_company_id;

    const payload = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);

      const cust = await client.query<{ id: string }>(
        `
          SELECT id
          FROM mdata.customers
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [customerId, companyId]
      );
      if (!cust.rows[0]) return { error: "not_found" as const };

      const revenueRes = await client.query<{ ym: string; cents: string }>(
        `
          SELECT
            to_char(date_trunc('month', issue_date), 'YYYY-MM') AS ym,
            COALESCE(sum(total_cents), 0)::text AS cents
          FROM accounting.invoices
          WHERE operating_company_id = $1::uuid
            AND customer_id = $2::uuid
            AND status NOT IN ('void')
            AND issue_date >= (date_trunc('month', now()) - interval '11 months')::date
          GROUP BY 1
          ORDER BY 1 ASC
        `,
        [companyId, customerId]
      );

      const agingRes = await client.query<{ bucket: string; cents: string }>(
        `
          SELECT
            CASE
              WHEN due_date >= current_date THEN 'current'
              WHEN due_date >= current_date - interval '30 days' THEN '1_30'
              WHEN due_date >= current_date - interval '60 days' THEN '31_60'
              WHEN due_date >= current_date - interval '90 days' THEN '61_90'
              ELSE '90_plus'
            END AS bucket,
            COALESCE(sum(amount_open_cents), 0)::text AS cents
          FROM accounting.invoices
          WHERE operating_company_id = $1::uuid
            AND customer_id = $2::uuid
            AND status IN ('sent', 'partial')
            AND amount_open_cents > 0
          GROUP BY 1
        `,
        [companyId, customerId]
      );

      const loadsRes = await client.query<{
        id: string;
        load_number: string | null;
        status: string | null;
        rate_total_cents: number | null;
        created_at: string;
      }>(
        `
          SELECT id, load_number, status::text, rate_total_cents, created_at::text
          FROM mdata.loads
          WHERE operating_company_id = $1::uuid
            AND customer_id = $2::uuid
            AND soft_deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT 50
        `,
        [companyId, customerId]
      );

      const documents = await listAttachments(user.uuid, {
        operatingCompanyId: companyId,
        entityType: "customer",
        entityId: customerId,
      }).catch(() => []);

      return {
        revenue_by_month: revenueRes.rows.map((r) => ({ month: r.ym, total_cents: Number(r.cents) })),
        ar_aging_buckets: agingRes.rows.map((r) => ({ bucket: r.bucket, open_cents: Number(r.cents) })),
        recent_loads: loadsRes.rows.map((r) => ({
          id: r.id,
          load_number: r.load_number,
          status: r.status,
          rate_total_cents: r.rate_total_cents,
          created_at: r.created_at,
        })),
        documents,
      };
    });

    if ("error" in payload && payload.error === "not_found") return reply.code(404).send({ error: "customer_not_found" });

    return payload;
  });
}
