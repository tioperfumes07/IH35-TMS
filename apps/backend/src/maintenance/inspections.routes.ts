import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const createSchema = z.object({
  operating_company_id: z.string().uuid(),
  unit_id: z.string().uuid(),
  inspection_type: z.string().trim().min(2).max(80),
  inspection_date: z.string(),
  inspector_name: z.string().trim().min(2).max(120),
  mileage: z.number().int().nonnegative().optional(),
  outcome: z.enum(["pass", "fail"]),
  defects: z.array(z.string().trim().min(1).max(240)).optional().default([]),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    return fn(client);
  });
}

export async function registerMaintenanceInspectionsRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/inspections", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const rows = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            id::text,
            operating_company_id::text,
            unit_id::text,
            inspection_type,
            inspection_date::text,
            inspector_name,
            mileage,
            outcome,
            defects,
            created_at::text
          FROM maintenance.dot_inspection_events
          WHERE operating_company_id = $1
          ORDER BY inspection_date DESC, created_at DESC
          LIMIT 200
        `,
        [parsed.data.operating_company_id]
      );
      return res.rows;
    });
    return { rows };
  });

  app.post("/api/v1/maintenance/inspections", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;
    const created = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO maintenance.dot_inspection_events (
            operating_company_id, unit_id, inspection_type, inspection_date, inspector_name, mileage, outcome, defects, created_at
          ) VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8::text[],now())
          RETURNING id::text, unit_id::text, inspection_type, inspection_date::text, outcome
        `,
        [body.operating_company_id, body.unit_id, body.inspection_type, body.inspection_date, body.inspector_name, body.mileage ?? null, body.outcome, body.defects]
      );
      await appendCrudAudit(client, user.uuid, "maintenance.inspection.created", {
        resource_id: res.rows[0]?.id,
        operating_company_id: body.operating_company_id,
        inspection_type: body.inspection_type,
      });
      return res.rows[0];
    });
    return reply.code(201).send(created);
  });
}
