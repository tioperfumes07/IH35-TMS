import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { listDriverCommunications } from "./communications.service.js";

const paramsSchema = z.object({ id: z.string().uuid() });
const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  channel: z.enum(["sms", "email", "in_app"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

function officeAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

export async function registerDriverCommunicationsRoutes(app: FastifyInstance) {
  app.get("/api/v1/drivers/:id/communications", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = officeAuth(req, reply);
    if (!authUser) return;

    const params = paramsSchema.safeParse(req.params ?? {});
    const query = querySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    const { id: driverId } = params.data;
    const { operating_company_id: operatingCompanyId, channel, limit, offset } = query.data;

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      await setScopedCompanyContext(client, authUser.uuid, operatingCompanyId);
      const parent = await client.query(
        `
          SELECT 1
          FROM mdata.drivers d
          WHERE d.id = $1::uuid
            AND d.archived_at IS NULL
            AND (
              d.operating_company_id = $2::uuid
              OR EXISTS (
                SELECT 1
                FROM mdata.driver_company_authorizations dca
                WHERE dca.driver_id = d.id
                  AND dca.company_id = $2::uuid
                  AND dca.is_authorized = true
                  AND dca.deactivated_at IS NULL
              )
            )
          LIMIT 1
        `,
        [driverId, operatingCompanyId]
      );
      if (parent.rowCount === 0) return null;
      return listDriverCommunications(client as Queryable, {
        operatingCompanyId,
        driverId,
        channel,
        limit,
        offset,
      });
    });

    if (!result) return reply.code(404).send({ error: "mdata_driver_not_found" });

    return reply.send({
      driver_id: driverId,
      entries: result.entries,
      total: result.total,
      limit,
      offset,
    });
  });
}
