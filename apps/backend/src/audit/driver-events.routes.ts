import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { listDriverAuditEvents } from "./driver-events.service.js";

// LV-AUDIT-HISTORY-STATUS-SOURCE-SINGLE-SELECT: comma-separated query params transformed to arrays
// (OR'd filter) — mirrors audit-events-list.routes.ts's commaListSchema for the shared entity-audit
// endpoint; this route serves the driver-specific audit tab separately.
const commaListSchema = (max: number) =>
  z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const parts = v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, max);
      return parts.length > 0 ? parts : undefined;
    });

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  entity_type: z.literal("driver"),
  entity_id: z.string().uuid(),
  event_type: commaListSchema(20),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  // SAF-B29 — AuditHistoryTab chrome sent these nowhere; events past LIMIT were invisible under filter.
  actor: z.string().trim().min(1).max(300).optional(),
  status: commaListSchema(20),
  source: commaListSchema(20),
  voids_only: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
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
  app.get("/api/v1/audit/events", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
      actor: parsed.data.actor,
      status: parsed.data.status,
      source: parsed.data.source,
      voids_only: parsed.data.voids_only,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
  });
}
