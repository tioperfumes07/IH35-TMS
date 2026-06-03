import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  companyId: string,
  fn: (client: { query: (...args: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<T>
): Promise<T> {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
    return fn(client);
  });
}

export async function registerAutoWoDraftsRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/auto-wo-drafts", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const rows = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            w.*,
            h.fault_code,
            h.severity AS fault_severity,
            h.occurred_at AS fault_occurred_at,
            u.unit_number
          FROM maintenance.work_orders w
          LEFT JOIN maintenance.samsara_fault_code_history h ON h.id = w.origin_fault_history_id
          LEFT JOIN mdata.units u ON u.id = w.unit_id
          WHERE w.operating_company_id = $1::uuid
            AND w.origin = 'fault_auto'
            AND w.status = 'draft'
          ORDER BY w.created_at DESC
          LIMIT $2 OFFSET $3
        `,
        [q.operating_company_id, q.limit, q.offset]
      );
      return res.rows;
    });
    return { drafts: rows, limit: q.limit, offset: q.offset };
  });
}
