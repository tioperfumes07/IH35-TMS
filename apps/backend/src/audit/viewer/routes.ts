import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import { getEventDetail, queryAuditEvents } from "./service.js";

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  entity_type: z.string().trim().min(1).max(200).optional(),
  entity_uuid: z.string().uuid().optional(),
  user_uuid: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(200).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  severity: z.enum(["info", "warning", "critical"]).optional(),
  search_text: z.string().trim().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const detailParamsSchema = z.object({
  uuid: z.string().uuid(),
});

const detailQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function ownerOnly(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  const role = String(req.user?.role ?? "");
  if (role !== "Owner" && role !== "SuperAdmin") {
    reply.code(403).send({ error: "forbidden", reason: "Owner-only route" });
    return null;
  }
  return req.user!;
}

export async function registerAuditViewerRoutes(app: FastifyInstance) {
  app.get("/api/audit/viewer/events", async (req, reply) => {
    const user = ownerOnly(req, reply);
    if (!user) return;

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    return queryAuditEvents(user.uuid, parsed.data);
  });

  app.get("/api/audit/viewer/events/:uuid", async (req, reply) => {
    const user = ownerOnly(req, reply);
    if (!user) return;

    const paramsParsed = detailParamsSchema.safeParse(req.params ?? {});
    if (!paramsParsed.success) {
      return reply.code(400).send({ error: "validation_error", details: paramsParsed.error.flatten() });
    }

    const queryParsed = detailQuerySchema.safeParse(req.query ?? {});
    if (!queryParsed.success) {
      return reply.code(400).send({ error: "validation_error", details: queryParsed.error.flatten() });
    }

    const event = await getEventDetail(user.uuid, queryParsed.data.operating_company_id, paramsParsed.data.uuid);
    if (!event) {
      return reply.code(404).send({ error: "not_found" });
    }
    return { event };
  });
}
