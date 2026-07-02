import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const createHosExceptionSchema = z.object({
  driver_id: z.string().uuid(),
  exception_type: z.string().trim().min(1),
  exception_date: z.string(),
  justification: z.string().trim().min(1),
});

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

export async function registerSafetyHosRoutes(app: FastifyInstance) {
  app.post("/api/v1/safety/hos/exceptions", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const body = createHosExceptionSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.hos_exceptions (
            operating_company_id,
            driver_id,
            exception_type,
            exception_date,
            justification
          )
          VALUES ($1, $2, $3, $4::date, $5)
          RETURNING *
        `,
        [
          query.data.operating_company_id,
          body.data.driver_id,
          body.data.exception_type,
          body.data.exception_date,
          body.data.justification,
        ]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.hos.exception_logged",
        {
          operating_company_id: query.data.operating_company_id,
          resource_type: "safety.hos_exceptions",
          resource_id: (res.rows[0] as { id?: string })?.id ?? null,
        },
        "info",
        "P7-SAFETY-TRAINING-PROGRAMS"
      );
      return res.rows[0];
    });

    return reply.code(201).send(created);
  });
}
