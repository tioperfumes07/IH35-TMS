import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireAuth } from "../auth/session-middleware.js";

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function querySuffix(req: FastifyRequest) {
  const q = req.url.split("?")[1];
  return q ? `?${q}` : "";
}

export async function registerCustomerDetailRoutes(app: FastifyInstance) {
  app.get("/api/v1/customers/:id/detail", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = req.params as { id: string };
    return reply.code(307).redirect(`/api/v1/mdata/customers/${params.id}/detail${querySuffix(req)}`);
  });
}
