import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

const querySchema = companyQuerySchema.extend({ from: z.string().date(), to: z.string().date() });

export async function registerDetentionClaimsRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/detention-claims", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    if (parsed.data.from > parsed.data.to) return reply.code(400).send({ error: "validation_error", details: { period: ["from must be on or before to"] } });
    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const result = await client.query(
        `SELECT de.id::text AS detention_event_id, de.started_at, de.stopped_at,
                de.status AS event_status, coalesce(dr.status, de.status) AS claim_status,
                de.load_id::text AS load_id, l.load_number::text AS load_number,
                l.customer_id::text AS customer_id, c.customer_name,
                ls.stop_type::text AS stop_type,
                concat_ws(', ', nullif(ls.city, ''), nullif(ls.state, '')) AS stop_location,
                coalesce(dr.billable_minutes, de.accrued_minutes)::int AS billable_minutes,
                coalesce(dr.rate_per_hour_cents, de.rate_per_hour_cents)::int AS rate_per_hour_cents,
                coalesce(dr.amount_cents, de.accrued_amount_cents)::int AS amount_cents,
                dr.reviewed_at, dr.rejection_reason, dr.invoice_id::text AS invoice_id,
                i.display_id::text AS invoice_display_id
           FROM dispatch.detention_events de
           JOIN mdata.loads l ON l.id = de.load_id AND l.operating_company_id = de.operating_company_id
           LEFT JOIN mdata.customers c ON c.id = l.customer_id AND c.operating_company_id = de.operating_company_id
           JOIN mdata.load_stops ls ON ls.id = de.stop_id AND ls.load_id = de.load_id
           LEFT JOIN dispatch.detention_requests dr ON dr.detention_event_id = de.id AND dr.operating_company_id = de.operating_company_id
           LEFT JOIN accounting.invoices i ON i.id = dr.invoice_id AND i.operating_company_id = de.operating_company_id
          WHERE de.operating_company_id = $1::uuid
            AND de.started_at::date BETWEEN $2::date AND $3::date
          ORDER BY de.started_at DESC`,
        [parsed.data.operating_company_id, parsed.data.from, parsed.data.to]
      );
      return result.rows;
    });
    return { period: { from: parsed.data.from, to: parsed.data.to }, rows };
  });
}
