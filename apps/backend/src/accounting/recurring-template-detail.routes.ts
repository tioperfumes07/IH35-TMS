import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { withCurrentUser } from "../auth/db.js";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";

const paramsSchema = z.object({ id: z.string().uuid() });

/** Exact, read-only reverse surface for accounting.recurring_templates (not recurring_bill_templates). */
export async function registerRecurringTemplateDetailRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/recurring-templates/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const opco = query.data.operating_company_id;
    await assertCompanyMembership(user.uuid, opco);
    const detail = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const result = await client.query(
        `SELECT rt.id::text, rt.kind, rt.cadence, rt.cron_expression, rt.next_run_at::text,
                rt.template_payload, rt.is_active, rt.last_run_at::text, rt.run_count,
                rt.created_at::text, rt.updated_at::text,
                COALESCE(NULLIF(TRIM(CONCAT(iu.first_name, ' ', iu.last_name)), ''), iu.email) AS created_by_name
           FROM accounting.recurring_templates rt
           LEFT JOIN identity.users iu ON iu.id = rt.created_by_user_id
          WHERE rt.operating_company_id = $1::uuid AND rt.id = $2::uuid
          LIMIT 1`,
        [opco, params.data.id],
      );
      return result.rows[0] ?? null;
    });
    if (!detail) return reply.code(404).send({ error: "RECURRING_TEMPLATE_NOT_FOUND", message: "Recurring template not found for this operating company." });
    return reply.send(detail);
  });
}

export default fp(registerRecurringTemplateDetailRoutes, { name: "accounting-recurring-template-detail-routes" });
