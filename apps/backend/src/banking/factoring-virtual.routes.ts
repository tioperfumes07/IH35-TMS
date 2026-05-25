import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
  }) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client);
  });
}

export async function registerBankingFactoringVirtualRoutes(app: FastifyInstance) {
  app.get("/api/v1/banking/factoring-virtual", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const summary = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client
        .query(
          `
            SELECT
              id,
              COALESCE(display_name, 'Factoring') AS display_name,
              COALESCE(current_reserve_balance, 0) AS reserve_balance,
              COALESCE(current_chargeback_balance, 0) AS chargeback_balance,
              last_advance_at
            FROM accounting.factoring_companies
            WHERE operating_company_id = $1
              AND active = true
            ORDER BY display_name
          `,
          [companyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows;
    });
    return { companies: summary };
  });

  app.get("/api/v1/banking/factoring-virtual/timeline", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const timeline = await withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client
        .query(
          `
            SELECT *
            FROM accounting.factoring_advances
            WHERE operating_company_id = $1
            ORDER BY created_at DESC
            LIMIT 500
          `,
          [companyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows;
    });
    return { timeline };
  });
}
