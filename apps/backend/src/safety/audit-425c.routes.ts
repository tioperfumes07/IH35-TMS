import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

async function withCompanyScope<T>(userId: string, companyId: string, fn: (client: Queryable) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    return fn(client as Queryable);
  });
}

export async function registerSafetyAudit425cRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/audit-425c", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT id, event_class, payload, emitted_at
          FROM audit.audit_events
          WHERE payload->>'operating_company_id' = $1
          ORDER BY emitted_at DESC
          LIMIT 500
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { rows };
  });
}
