import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

const QuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

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

    const params = ParamsSchema.safeParse(req.params ?? {});
    if (!params.success) {
      return reply.code(400).send({ error: "invalid_customer_id" });
    }

    const query = QuerySchema.safeParse(req.query ?? {});
    if (!query.success) {
      return reply.code(400).send({ error: "operating_company_id_required" });
    }

    return reply.code(307).redirect(`/api/v1/mdata/customers/${params.data.id}/detail${querySuffix(req)}`);
  });
}
