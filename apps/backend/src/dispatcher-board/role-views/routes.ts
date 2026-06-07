import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import { getDispatcherHomeData } from "./dispatcher.service.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
});

function canReadDispatcherHome(role: string): boolean {
  return ["Owner", "Administrator", "Manager", "Dispatcher"].includes(role);
}

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerDispatcherRoleViewRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatcher-board/home", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canReadDispatcherHome(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) {
      return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    }
    const data = await getDispatcherHomeData(user.uuid, {
      operatingCompanyId: query.data.operating_company_id,
    });
    return data;
  });
}
