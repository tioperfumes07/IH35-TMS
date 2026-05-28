import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { listAuditRowChanges } from "./audit.service.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  schema: z.string().trim().min(1).max(120).optional(),
  table: z.string().trim().min(1).max(120).optional(),
  row_pk: z.string().trim().min(1).max(250).optional(),
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

export async function registerAuditRoutes(app: FastifyInstance) {
  app.get("/api/v1/audit/row-changes", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    return listAuditRowChanges(user.uuid, parsed.data);
  });
}
