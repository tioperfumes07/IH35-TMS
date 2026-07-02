import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const createTrainingRecordSchema = z.object({
  driver_id: z.string().uuid(),
  training_name: z.string().trim().min(1),
  completed_at: z.string(),
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
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

export async function registerSafetyTrainingRecordsRoutes(app: FastifyInstance) {
  app.post("/api/v1/safety/training-records", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const body = createTrainingRecordSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.training_records (
            operating_company_id,
            driver_id,
            training_name,
            completed_at,
            expiry_date,
            notes
          )
          VALUES ($1, $2, $3, $4::timestamptz, $5::date, $6)
          RETURNING *
        `,
        [
          company.data.operating_company_id,
          body.data.driver_id,
          body.data.training_name,
          body.data.completed_at,
          body.data.expiry_date ?? null,
          body.data.notes ?? null,
        ]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.training_record.logged",
        {
          resource_type: "safety.training_records",
          resource_id: (res.rows[0] as { id?: string })?.id ?? null,
          operating_company_id: company.data.operating_company_id,
          driver_id: body.data.driver_id,
        },
        "info",
        "P7-SAFETY-DRIVER-PROFILES"
      );
      return res.rows[0];
    });

    return reply.code(201).send(created);
  });
}
