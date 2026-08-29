import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  ids: z.string().transform((value, context) => {
    const parsed = [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))];
    if (parsed.length === 0 || parsed.length > 200 || parsed.some((id) => !z.string().uuid().safeParse(id).success)) {
      context.addIssue({ code: "custom", message: "ids must contain 1–200 comma-separated UUIDs" });
      return z.NEVER;
    }
    return parsed;
  }),
});

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

/**
 * Exact reverse-label resolver for already-linked driver FKs.
 *
 * A paged roster is a picker source, not a reverse-link resolver: using its first N rows to name
 * persisted IDs makes older/archived drivers degrade to raw UUIDs. This route resolves only the
 * requested IDs, inside the requested company, and deliberately includes archived rows because
 * historical links must retain their human identity.
 */
export async function registerDriverLabelsRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/driver-labels", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const { operating_company_id: companyId, ids } = parsed.data;
    await assertCompanyMembership(user.uuid, companyId);
    const labels = await withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
      const result = await client.query<{ id: string; label: string }>(
        `SELECT d.id::text AS id,
                NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS label
           FROM mdata.drivers d
          WHERE (
                  d.operating_company_id = $1::uuid
                  OR EXISTS (
                    SELECT 1
                    FROM mdata.driver_company_authorizations label_dca
                    WHERE label_dca.driver_id = d.id
                      AND label_dca.company_id = $1::uuid
                      AND label_dca.is_authorized = true
                      AND label_dca.deactivated_at IS NULL
                  )
                )
            AND d.id = ANY($2::uuid[])
          ORDER BY array_position($2::uuid[], d.id)`,
        [companyId, ids],
      );
      return result.rows.filter((row) => Boolean(row.label));
    });
    return reply.send({ labels });
  });
}
