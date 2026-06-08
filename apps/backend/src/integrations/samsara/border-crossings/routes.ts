import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../auth/session-middleware.js";
import { getAverageCustomsTime, getHistoryForPeriod, getRecentCrossings } from "./customs-time.service.js";

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerBorderCrossingDetectorRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/border-crossings/history", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = z.object({
      operating_company_id: z.string().uuid(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      vehicle: z.string().optional(),
    }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    const rows = await getHistoryForPeriod(user.uuid, q.data.operating_company_id, q.data.from, q.data.to, q.data.vehicle);
    return reply.send({ data: rows });
  });

  app.get("/api/v1/dispatch/border-crossings/customs-time-avg", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = z.object({
      operating_company_id: z.string().uuid(),
      crossing: z.string(),
      direction: z.enum(["northbound", "southbound"]),
      days: z.coerce.number().int().min(1).max(365).default(30),
    }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    const avg = await getAverageCustomsTime(user.uuid, q.data.operating_company_id, q.data.crossing, q.data.direction, q.data.days);
    return reply.send({ data: avg });
  });

  app.get("/api/v1/dispatch/border-crossings/recent/:vehicleId", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const { vehicleId } = req.params as { vehicleId: string };
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    const rows = await getRecentCrossings(user.uuid, q.data.operating_company_id, vehicleId);
    return reply.send({ data: rows });
  });
}
