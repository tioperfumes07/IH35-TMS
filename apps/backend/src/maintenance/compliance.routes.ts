import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
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

export async function registerMaintenanceComplianceRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/compliance/425c-log", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            id::text,
            event_type,
            created_at::text,
            payload
          FROM audit.audit_events
          WHERE operating_company_id = $1
            AND (
              event_type ILIKE '%425c%'
              OR event_type ILIKE '%inspection%'
              OR event_type ILIKE '%compliance%'
            )
          ORDER BY created_at DESC
          LIMIT 200
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });
    return { rows };
  });
}
