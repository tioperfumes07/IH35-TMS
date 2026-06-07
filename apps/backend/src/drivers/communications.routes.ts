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
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerDriverCommunicationsRoutes(app: FastifyInstance) {
  app.get("/api/v1/drivers/:id/communications", async (req, reply) => {
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
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      return listDriverCommunications(client as Queryable, {
        operatingCompanyId,
        driverId,
        channel,
        limit,
        offset,
      });
    });

    return reply.send({
      driver_id: driverId,
      entries: result.entries,
      total: result.total,
      limit,
      offset,
    });
  });
}
