import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
  user_id: z.string().uuid().optional(),
  override_type: z.enum(["unit_block", "hos_violation"]).optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    return fn(client);
  });
}

export async function registerDispatchOverrideAuditRoutes(app: FastifyInstance) {
  app.get("/api/v1/audit/dispatch-overrides", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!["Owner", "Administrator"].includes(authUser.role)) {
      return reply.code(403).send({ error: "forbidden_owner_admin_only" });
    }
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const query = parsed.data;

    const rows = await withCompanyScope(authUser.uuid, query.operating_company_id, async (client) => {
      const values: unknown[] = [
        "dispatch.unit_block_overridden_by_owner",
        "dispatch.hos_override_by_manager",
        query.operating_company_id,
      ];
      const filters: string[] = [
        "event_class = ANY($1::text[])",
        "(payload->>'operating_company_id')::uuid = $2::uuid",
      ];
      if (query.from) {
        values.push(query.from);
        filters.push(`created_at >= $${values.length}::timestamptz`);
      }
      if (query.to) {
        values.push(query.to);
        filters.push(`created_at <= $${values.length}::timestamptz`);
      }
      if (query.user_id) {
        values.push(query.user_id);
        filters.push(`actor_user_uuid = $${values.length}::uuid`);
      }
      if (query.override_type) {
        values.push(query.override_type);
        filters.push(`payload->>'override_type' = $${values.length}`);
      }

      const res = await client
        .query(
          `
            SELECT
              uuid AS id,
              actor_user_uuid AS user_id,
              event_class AS event_type,
              severity,
              payload,
              created_at
            FROM audit.audit_events
            WHERE ${filters.join(" AND ")}
            ORDER BY created_at DESC
            LIMIT 500
          `,
          values
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows;
    });

    return { overrides: rows };
  });
}
