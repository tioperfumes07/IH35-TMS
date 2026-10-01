/**
 * E-44 — GET /api/v1/telematics/stop-events (Round 306).
 * unit_id XOR driver_id. Computed from E-03 (positions → stops → miles).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import {
  STOP_EVENTS_DEFAULT_HOURS,
  STOP_EVENTS_MAX_HOURS,
  fetchStopEvents,
} from "./stop-events.reads.js";

const querySchema = z
  .object({
    operating_company_id: z.string().uuid(),
    unit_id: z.string().uuid().optional(),
    driver_id: z.string().uuid().optional(),
    hours: z.coerce.number().int().min(1).max(STOP_EVENTS_MAX_HOURS).default(STOP_EVENTS_DEFAULT_HOURS),
  })
  .refine((v) => Boolean(v.unit_id) !== Boolean(v.driver_id), {
    message: "pass exactly one of unit_id or driver_id",
  });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerStopEventsRoutes(app: FastifyInstance) {
  app.get("/api/v1/telematics/stop-events", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const q = parsed.data;
    await assertCompanyMembership(user.uuid, q.operating_company_id);

    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [q.operating_company_id]);
      return fetchStopEvents(client, q.operating_company_id, {
        unitId: q.unit_id,
        driverId: q.driver_id,
        hours: q.hours,
      });
    });
  });
}
