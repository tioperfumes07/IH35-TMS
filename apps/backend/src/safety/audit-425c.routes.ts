import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

async function withCompanyScope<T>(userId: string, companyId: string, fn: (client: Queryable) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return fn(client as Queryable);
  });
}

export async function registerSafetyAudit425cRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/audit-425c", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          -- SAF-425C phantom columns (fixed 2026-07-30): this selected id / emitted_at, neither of
          -- which exists. audit.audit_events is (uuid, created_at, event_class, severity, payload,
          -- actor_user_uuid, source) — verified on prod. Every call raised undefined_column, so the
          -- 425C exhibit endpoint returned a 500 rather than an exhibit. Aliased back to the old field
          -- names so any existing consumer keeps working; the COLUMNS are what were wrong, not the API.
          SELECT uuid AS id, event_class, payload, created_at AS emitted_at
          FROM audit.audit_events
          WHERE payload->>'operating_company_id' = $1
          ORDER BY created_at DESC
          LIMIT 500
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { rows };
  });
}
