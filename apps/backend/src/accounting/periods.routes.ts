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
  app.get("/api/v1/accounting/periods", async (req, reply) => {
    const user = accountingReader(req, reply);
    if (!user) return;

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
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
          WHERE operating_company_id = $1::uuid
          ORDER BY period_start DESC, created_at DESC
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });

    return { periods: rows };
  });

  app.get("/api/v1/accounting/periods/:id", async (req, reply) => {
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
