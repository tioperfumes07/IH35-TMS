import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const createFmcsaEventSchema = z.object({
  event_type: z.string().trim().min(1),
  event_date: z.string(),
  section_reference: z.string().trim().optional(),
  details: z.string().trim().min(1),
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

export async function registerSafetyFmcsaRoutes(app: FastifyInstance) {
  app.post("/api/v1/safety/events/fmcsa", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const body = createFmcsaEventSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.fmcsa_events (
            operating_company_id,
            event_type,
            event_date,
            section_reference,
            details
          )
          VALUES ($1, $2, $3::date, $4, $5)
          RETURNING *
        `,
        [
          company.data.operating_company_id,
          body.data.event_type,
          body.data.event_date,
          body.data.section_reference ?? null,
          body.data.details,
        ]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "safety.events.fmcsa_created",
        {
          operating_company_id: company.data.operating_company_id,
          resource_type: "safety.fmcsa_events",
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
