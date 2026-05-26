import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const driverParamsSchema = z.object({
  driver_id: z.string().uuid(),
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

function expiryPill(daysToExpiry: number | null) {
  if (daysToExpiry == null) return "unknown";
  if (daysToExpiry < 0) return "red";
  if (daysToExpiry <= 30) return "amber";
  return "green";
}

export async function registerSafetyDriverProfileRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/driver-profiles/:driver_id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const params = driverParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });

    const profile = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const profileRes = await client
        .query(
          `
            SELECT *
            FROM safety.driver_safety_profiles
            WHERE operating_company_id = $1
              AND driver_id = $2
              AND voided_at IS NULL
            LIMIT 1
          `,
          [company.data.operating_company_id, params.data.driver_id]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      const row = profileRes.rows[0] ?? null;
      if (!row) return null;
      const days = Number((row as { medical_days_to_expiry?: number }).medical_days_to_expiry ?? NaN);
      return {
        ...row,
        medical_expiry_pill: expiryPill(Number.isFinite(days) ? days : null),
      };
    });

    if (!profile) return reply.code(404).send({ error: "driver_profile_not_found" });
    return profile;
  });
}
