import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  unit_id: z.string().uuid().optional(),
  unresolved_only: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
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

export async function registerFaultHistoryRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/fault-history", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const payload = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      const params: unknown[] = [q.operating_company_id];
      let where = "h.operating_company_id = $1::uuid";
      if (q.unit_id) {
        params.push(q.unit_id);
        where += ` AND h.unit_id = $${params.length}::uuid`;
      }
      if (q.unresolved_only) {
        where += " AND h.resolved_at IS NULL";
      }
      params.push(q.limit, q.offset);
      const res = await client.query(
        `
          SELECT
            h.*,
            u.unit_number,
            w.status AS wo_status,
            w.display_id AS wo_display_id
          FROM maintenance.samsara_fault_code_history h
          LEFT JOIN mdata.units u ON u.id = h.unit_id
          LEFT JOIN maintenance.work_orders w ON w.id = h.auto_wo_id
          WHERE ${where}
          ORDER BY h.occurred_at DESC
          LIMIT $${params.length - 1}
          OFFSET $${params.length}
        `,
        params
      );
      return res.rows;
    });
    return { items: payload, limit: q.limit, offset: q.offset };
  });
}
