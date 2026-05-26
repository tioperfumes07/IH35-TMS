import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const createDqItemSchema = z.object({
  driver_id: z.string().uuid(),
  item_name: z.string().trim().min(1),
  status: z.enum(["present", "missing", "expired"]).default("present"),
  effective_date: z.string().optional(),
  expiry_date: z.string().optional(),
  notes: z.string().optional(),
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

export async function registerSafetyDriverQualificationRoutes(app: FastifyInstance) {
  app.post("/api/v1/safety/driver-qualification/items", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const body = createDqItemSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const insertRes = await client.query(
        `
          INSERT INTO safety.driver_qualification_files (
            operating_company_id,
            driver_id,
            item_name,
            status,
            effective_date,
            expiry_date,
            notes
          )
          VALUES ($1, $2, $3, $4, $5::date, $6::date, $7)
          RETURNING *
        `,
        [
          company.data.operating_company_id,
          body.data.driver_id,
          body.data.item_name,
          body.data.status,
          body.data.effective_date ?? null,
          body.data.expiry_date ?? null,
          body.data.notes ?? null,
        ]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "safety.driver_qualification.item_created",
        {
          resource_type: "safety.driver_qualification_files",
          resource_id: (insertRes.rows[0] as { id?: string })?.id ?? null,
          operating_company_id: company.data.operating_company_id,
          driver_id: body.data.driver_id,
        },
        "info",
        "P7-SAFETY-DRIVER-PROFILES"
      );
      return insertRes.rows[0];
    });

    return reply.code(201).send(created);
  });
}
