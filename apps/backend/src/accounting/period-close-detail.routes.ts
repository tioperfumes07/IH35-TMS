import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { withCurrentUser } from "../auth/db.js";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";

const paramsSchema = z.object({ fiscal_year_id: z.string().regex(/^FY\d{4}$/) });

/** Read-only exact reverse surface for transaction_source_links period_close/FY#### records. */
export async function registerPeriodCloseDetailRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/period-closes/:fiscal_year_id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const opco = query.data.operating_company_id;
    await assertCompanyMembership(user.uuid, opco);
    const entries = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const result = await client.query(
        `SELECT je.id::text AS journal_entry_id, je.entry_date::text, je.memo, je.status,
                SUM(jep.amount_cents) FILTER (WHERE jep.debit_or_credit = 'debit')::text AS debit_cents,
                SUM(jep.amount_cents) FILTER (WHERE jep.debit_or_credit = 'credit')::text AS credit_cents,
                MIN(tsl.created_at)::text AS linked_at
           FROM accounting.transaction_source_links tsl
           JOIN accounting.journal_entry_postings jep
             ON jep.id = tsl.journal_entry_posting_id
            AND jep.operating_company_id = tsl.operating_company_id
           JOIN accounting.journal_entries je
             ON je.id = jep.journal_entry_uuid
            AND je.operating_company_id = tsl.operating_company_id
          WHERE tsl.operating_company_id = $1::uuid
            AND tsl.linked_object_type = 'period_close'
            AND tsl.linked_object_id = $2
          GROUP BY je.id, je.entry_date, je.memo, je.status
          ORDER BY je.entry_date DESC, je.id DESC`,
        [opco, params.data.fiscal_year_id],
      );
      return result.rows;
    });
    if (entries.length === 0) return reply.code(404).send({ error: "PERIOD_CLOSE_NOT_FOUND", message: "Fiscal-year close not found for this operating company." });
    return reply.send({ fiscal_year_id: params.data.fiscal_year_id, fiscal_year: Number(params.data.fiscal_year_id.slice(2)), entries });
  });
}

export default fp(registerPeriodCloseDetailRoutes, { name: "accounting-period-close-detail-routes" });
