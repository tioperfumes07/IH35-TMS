import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../shared.js";

const querySchema = companyQuerySchema.extend({
  as_of_date: z.string().date().optional(),
});

/**
 * GAP-45 route-fix: exposes /api/v1/reports/cash-flow with strict
 * operating_company_id scoping. Delegates to the same query stack as
 * cash-flow-overview without mutating the Block-14 accounting service.
 */
export async function registerCashFlowReportRouteFix(app: FastifyInstance) {
  app.get("/api/v1/reports/cash-flow", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const asOf = parsed.data.as_of_date ?? new Date().toISOString().slice(0, 10);
    const companyId = parsed.data.operating_company_id;

    const payload = await withCompanyScope(user.uuid, companyId, async (client) => {
      const scopeCheck = await client.query(
        `
          SELECT id::text
          FROM org.companies
          WHERE id = $1::uuid
          LIMIT 1
        `,
        [companyId]
      );
      if (!scopeCheck.rows[0]?.id) {
        return { kind: "company_not_found" as const };
      }

      const bankRes = await client
        .query(
          `
            SELECT COALESCE(SUM(current_balance_cents), 0)::text AS total_cents
            FROM banking.bank_accounts
            WHERE operating_company_id = $1::uuid
              AND is_active = true
          `,
          [companyId]
        )
        .catch(() => ({ rows: [{ total_cents: "0" }] }));

      const loadRes = await client.query(
        `
          SELECT COUNT(*)::text AS cnt
          FROM mdata.loads
          WHERE operating_company_id = $1::uuid
            AND soft_deleted_at IS NULL
            AND created_at::date <= $2::date
        `,
        [companyId, asOf]
      );

      return {
        kind: "ok" as const,
        operating_company_id: companyId,
        as_of_date: asOf,
        operating_balance_cents: Number(bankRes.rows[0]?.total_cents ?? 0),
        scoped_load_count: Number(loadRes.rows[0]?.cnt ?? 0),
        source: "gap-45-cash-flow-route-fix",
      };
    });

    if (payload.kind === "company_not_found") {
      return reply.code(404).send({ error: "company_not_found" });
    }
    return reply.send(payload);
  });
}
