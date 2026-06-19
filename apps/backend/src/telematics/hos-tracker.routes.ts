import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { getHosDaily, getHosEvents } from "./hos-tracker.service.js";

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

const dailySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Laredo calendar day
});

const eventsSchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export async function registerHosTrackerRoutes(app: FastifyInstance) {
  // Per-driver daily duty-status timeline + clocks for the Compliance HOS Tracker tab. Reads the ingested
  // hos.duty_status_events; returns honest "available:false" + null clocks when a driver-day has no events.
  app.get("/api/v1/telematics/hos/daily", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const q = dailySchema.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });

    const now = new Date();
    const daily = await withCurrentUser(user.uuid, (client) =>
      getHosDaily(client, q.data.operating_company_id, q.data.driver_id, q.data.date, now)
    );
    return reply.send({ ...daily, generated_at: now.toISOString() });
  });

  // Raw duty-status segments for a driver over a window (FMCSA audit / drill-down).
  app.get("/api/v1/telematics/hos/events", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const q = eventsSchema.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });

    const events = await withCurrentUser(user.uuid, (client) =>
      getHosEvents(client, q.data.operating_company_id, q.data.driver_id, new Date(q.data.from), new Date(q.data.to))
    );
    return reply.send({ events, count: events.length });
  });
}
