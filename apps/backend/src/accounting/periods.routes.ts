import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

const periodReadRoles = new Set(["Owner", "Administrator", "Manager", "Accountant"]);

function accountingReader(req: Parameters<typeof currentAuthUser>[0], reply: Parameters<typeof currentAuthUser>[1]) {
  const user = currentAuthUser(req, reply);
  if (!user) return null;
  if (!periodReadRoles.has(String(user.role ?? ""))) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user as { uuid: string; role: string };
}

const periodIdParamSchema = z.object({
  id: z.string().uuid(),
});

export async function registerAccountingPeriodsReadRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/periods", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = accountingReader(req, reply);
    if (!user) return;

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            p.id,
            p.period_label,
            p.period_start::text AS period_start,
            p.period_end::text AS period_end,
            p.fiscal_year,
            p.status,
            p.closed_at::text AS closed_at,
            cje.id::text AS closing_journal_entry_id
          FROM accounting.periods p
          -- LINK-F5186 (accounting.panel.period_status): resolve the real fiscal-year-close JE
          -- that period-close-retained-earnings.service.ts posts (source='auto', entry_date =
          -- period_end, memo = "Fiscal year-end close FY<fiscal_year>...") so the panel can drill
          -- directly to it instead of only a generic Month Close list link.
          LEFT JOIN LATERAL (
            SELECT je.id
            FROM accounting.journal_entries je
            WHERE je.operating_company_id = p.operating_company_id
              AND je.source = 'auto'
              AND je.entry_date = p.period_end
              AND je.memo ILIKE 'Fiscal year-end close FY' || p.fiscal_year || '%'
            ORDER BY je.created_at DESC
            LIMIT 1
          ) cje ON true
          WHERE p.operating_company_id = $1::uuid
          ORDER BY p.period_start DESC, p.created_at DESC
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });

    return { periods: rows };
  });

  app.get("/api/v1/accounting/periods/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = accountingReader(req, reply);
    if (!user) return;

    const params = periodIdParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            id,
            period_label,
            period_start::text AS period_start,
            period_end::text AS period_end,
            fiscal_year,
            status,
            closed_at::text AS closed_at
          FROM accounting.periods
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "not_found" });
    return row;
  });
}


export default fp(async (app) => {
  await registerAccountingPeriodsReadRoutes(app);
}, { name: "accounting.registerAccountingPeriodsReadRoutes" });
