import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const createBackgroundCheckSchema = z.object({
  driver_id: z.string().uuid(),
  check_type: z.enum(["psp", "mvr", "drug", "employment_verify"]),
  result: z.enum(["pass", "fail"]),
  checked_at: z.string(),
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
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

export async function registerSafetyBackgroundChecksRoutes(app: FastifyInstance) {
  app.post("/api/v1/safety/background-checks", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const body = createBackgroundCheckSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.background_checks (
            operating_company_id,
            driver_id,
            check_type,
            result,
            checked_at,
            expiry_date,
            notes
          )
          VALUES ($1, $2, $3, $4, $5::timestamptz, $6::date, $7)
          RETURNING *
        `,
        [
          company.data.operating_company_id,
          body.data.driver_id,
          body.data.check_type,
          body.data.result,
          body.data.checked_at,
          body.data.expiry_date ?? null,
          body.data.notes ?? null,
        ]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.background_check.created",
        {
          resource_type: "safety.background_checks",
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
