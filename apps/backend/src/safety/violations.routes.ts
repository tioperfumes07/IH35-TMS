import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const createViolationSchema = z.object({
  source_type: z.enum(["accident", "citation", "roadside"]),
  source_event_id: z.string().uuid(),
  csa_basic: z.string().trim().min(1),
  severity_weight: z.number().int().min(1).max(10),
  status: z.enum(["open", "closed"]).default("open"),
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client as Queryable);
  });
}

export async function registerSafetyViolationsRoutes(app: FastifyInstance) {
  app.post("/api/v1/safety/events/violations", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const body = createViolationSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.violations (
            operating_company_id,
            source_type,
            source_event_id,
            csa_basic,
            severity_weight,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [
          company.data.operating_company_id,
          body.data.source_type,
          body.data.source_event_id,
          body.data.csa_basic,
          body.data.severity_weight,
          body.data.status,
        ]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.events.violation_created",
        {
          operating_company_id: company.data.operating_company_id,
          resource_type: "safety.violations",
          resource_id: (res.rows[0] as { id?: string })?.id ?? null,
          before: null,
          after: res.rows[0] ?? null,
        },
        "warning",
        "P7-SAFETY-EVENTS"
      );
      return res.rows[0];
    });
    return reply.code(201).send(created);
  });
}
