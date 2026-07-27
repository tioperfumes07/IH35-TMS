import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

async function withCompanyScope<T>(userId: string, companyId: string, fn: (client: Queryable) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    return fn(client as Queryable);
  });
}

export async function registerSafetyAudit425cRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/audit-425c", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          -- SAF-425C-PHANTOM: this selected id and emitted_at. audit.audit_events has NEITHER
          -- (prod-verified 2026-07-27: columns are uuid, created_at, event_class, severity, payload,
          -- actor_user_uuid, source — exactly as docs/CLAUDE.md §8 documents them; the doc was right
          -- and the code was wrong). Every call threw 42703, so the Form 425C Chapter 11 DIP audit
          -- trail — the one a bankruptcy court reads — returned nothing but an error, over a table
          -- holding 629,214 rows of which 228,953 are TRANSP's.
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
