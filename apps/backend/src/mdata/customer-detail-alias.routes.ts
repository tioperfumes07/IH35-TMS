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

export async function registerCustomerDetailAliasRoutes(app: FastifyInstance) {
  app.get("/api/v1/customers/:customer_id/contacts", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = req.params as { customer_id: string };
    return reply.code(307).redirect(`/api/v1/mdata/customers/${params.customer_id}/contacts${querySuffix(req)}`);
  });

  app.post("/api/v1/customers/:customer_id/contacts", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = req.params as { customer_id: string };
    return reply.code(307).redirect(`/api/v1/mdata/customers/${params.customer_id}/contacts${querySuffix(req)}`);
  });

  app.get("/api/v1/customers/:customer_id/billing-summary", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = req.params as { customer_id: string };
    return reply.code(307).redirect(`/api/v1/mdata/customers/${params.customer_id}/billing-summary${querySuffix(req)}`);
  });

  app.get("/api/v1/customers/:customer_id/lanes", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = req.params as { customer_id: string };
    return reply.code(307).redirect(`/api/v1/mdata/customers/${params.customer_id}/lanes${querySuffix(req)}`);
  });

  app.post("/api/v1/customers/:customer_id/lanes", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = req.params as { customer_id: string };
    return reply.code(307).redirect(`/api/v1/mdata/customers/${params.customer_id}/lanes${querySuffix(req)}`);
  });

  app.patch("/api/v1/customers/:customer_id/lanes/:lane_id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = req.params as { customer_id: string; lane_id: string };
    return reply.code(307).redirect(`/api/v1/mdata/customers/${params.customer_id}/lanes/${params.lane_id}${querySuffix(req)}`);
  });

  app.delete("/api/v1/customers/:customer_id/lanes/:lane_id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = req.params as { customer_id: string; lane_id: string };
    return reply.code(307).redirect(`/api/v1/mdata/customers/${params.customer_id}/lanes/${params.lane_id}${querySuffix(req)}`);
  });
}
