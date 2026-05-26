import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const createAccidentSchema = z.object({
  happened_at: z.string(),
  location: z.string().trim().min(1),
  driver_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  accident_type: z.enum(["preventable", "non_preventable", "property", "injury", "fatality"]),
  narrative: z.string().optional(),
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

export async function registerSafetyAccidentsRoutes(app: FastifyInstance) {
  app.post("/api/v1/safety/events/accidents", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const body = createAccidentSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.accidents (
            operating_company_id,
            happened_at,
            location,
            driver_id,
            unit_id,
            accident_type,
            narrative
          )
          VALUES ($1, $2::timestamptz, $3, $4, $5, $6, $7)
          RETURNING *
        `,
        [
          company.data.operating_company_id,
          body.data.happened_at,
          body.data.location,
          body.data.driver_id ?? null,
          body.data.unit_id ?? null,
          body.data.accident_type,
          body.data.narrative ?? null,
        ]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.events.accident_created",
        {
          operating_company_id: company.data.operating_company_id,
          resource_type: "safety.accidents",
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
