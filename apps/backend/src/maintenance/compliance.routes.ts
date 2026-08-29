import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return fn(client);
  });
}

export async function registerMaintenanceComplianceRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/compliance/425c-log", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const result = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const predicate = `payload->>'operating_company_id' = $1
        AND (event_class ILIKE '%425c%' OR event_class ILIKE '%inspection%' OR event_class ILIKE '%compliance%')`;
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS total_count FROM audit.audit_events WHERE ${predicate}`,
        [query.data.operating_company_id]
      );
      const res = await client.query(
        `
          -- audit.audit_events PK is uuid (not id); class is event_class (not event_type);
          -- company scope lives in payload, not a table column. Bare id/event_type/operating_company_id
          -- 500 the 425C related hop /maintenance/compliance (undefined_column).
          SELECT
            uuid::text AS id,
            event_class AS event_type,
            created_at::text,
            payload
          FROM audit.audit_events
          WHERE ${predicate}
          ORDER BY created_at DESC, uuid DESC
          LIMIT $2 OFFSET $3
        `,
        [query.data.operating_company_id, query.data.limit, query.data.offset]
      );
      return { rows: res.rows, total_count: Number(countRes.rows[0]?.total_count ?? 0) };
    });
    return result;
  });
}
