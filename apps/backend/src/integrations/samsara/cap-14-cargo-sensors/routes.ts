/**
 * CAP-14 Cargo Sensor Routes — GAP-64
 * Base path: /api/v1/dispatch/cargo-sensors
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../../auth/db.js";
import { requireAuth } from "../../../auth/session-middleware.js";
import { listCargoSensorTimelineForLoad, listOutOfRangeCargoReadings, type DbClient } from "./ingester.service.js";

const timelineParamsSchema = z.object({
  load_uuid: z.string().uuid(),
});

const timelineQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(200),
});

const outOfRangeQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(200),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: DbClient) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
    return fn(client);
  });
}

export async function registerCap14CargoSensorRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/dispatch/cargo-sensors/load/:load_uuid/timeline", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = timelineParamsSchema.safeParse(req.params);
    if (!params.success) return validationError(reply, params.error);
    const query = timelineQuerySchema.safeParse(req.query);
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompany(user.uuid, query.data.operating_company_id, async (client) =>
      listCargoSensorTimelineForLoad(
        client,
        query.data.operating_company_id,
        params.data.load_uuid,
        query.data.limit
      )
    );

    return reply.send(payload);
  });

  app.get("/api/v1/dispatch/cargo-sensors/out-of-range", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = outOfRangeQuerySchema.safeParse(req.query);
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) =>
      listOutOfRangeCargoReadings(client, query.data.operating_company_id, {
        from: query.data.from,
        to: query.data.to,
        limit: query.data.limit,
      })
    );

    return reply.send({
      rows,
      count: rows.length,
      operating_company_id: query.data.operating_company_id,
    });
  });
}
