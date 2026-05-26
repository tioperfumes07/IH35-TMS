import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const createRoadsideSchema = z.object({
  inspected_at: z.string(),
  driver_id: z.string().uuid(),
  unit_id: z.string().uuid(),
  inspection_level: z.number().int().min(1).max(6),
  result: z.enum(["clean", "with_violations", "oos_vehicle", "oos_driver"]),
  jurisdiction: z.string().trim().min(1),
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

export async function registerSafetyRoadsideRoutes(app: FastifyInstance) {
  app.post("/api/v1/safety/events/roadside", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const body = createRoadsideSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.roadside_inspections (
            operating_company_id,
            inspected_at,
            driver_id,
            unit_id,
            inspection_level,
            result,
            jurisdiction
          )
          VALUES ($1, $2::timestamptz, $3, $4, $5, $6, $7)
          RETURNING *
        `,
        [
          company.data.operating_company_id,
          body.data.inspected_at,
          body.data.driver_id,
          body.data.unit_id,
          body.data.inspection_level,
          body.data.result,
          body.data.jurisdiction,
        ]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.events.roadside_created",
        {
          operating_company_id: company.data.operating_company_id,
          resource_type: "safety.roadside_inspections",
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
