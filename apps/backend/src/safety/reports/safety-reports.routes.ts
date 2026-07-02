import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const reportParamsSchema = z.object({ report_id: z.string().trim().min(1) });

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

export async function registerSafetyReportsRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/reports/:report_id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const params = reportParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT event_class, count(*)::int AS total
          FROM audit.audit_events
          WHERE payload->>'operating_company_id' = $1
            AND event_class ILIKE 'safety.%'
          GROUP BY event_class
          ORDER BY event_class
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { report_id: params.data.report_id, rows };
  });

  app.get("/api/v1/safety/reports/:report_id/export.xlsx", async (req, reply) => {
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const params = reportParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const csv = "event_class,total\nsafety.sample,0\n";
    return reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="safety-${params.data.report_id}.xlsx"`)
      .send(Buffer.from(csv, "utf8"));
  });
}
