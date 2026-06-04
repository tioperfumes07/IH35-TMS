import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { listDriverAuditEvents } from "./driver-events.service.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  entity_type: z.literal("driver"),
  entity_id: z.string().uuid(),
  event_type: z.string().trim().min(1).max(200).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  const role = String(req.user?.role ?? "");
  if (!["Owner", "Administrator", "Manager", "Accountant"].includes(role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return req.user!;
}

export async function registerDriverAuditEventsRoutes(app: FastifyInstance) {
  app.get("/api/v1/audit/events", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    return listDriverAuditEvents(user.uuid, {
      operating_company_id: parsed.data.operating_company_id,
      driver_id: parsed.data.entity_id,
      event_type: parsed.data.event_type,
      from: parsed.data.from,
      to: parsed.data.to,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
  });
}
