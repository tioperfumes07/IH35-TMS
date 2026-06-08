import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { assertCustomerScope, getTerms, listTermsHistory, updateTerms } from "./free-time-detention.service.js";

const paramsSchema = z.object({ uuid: z.string().uuid() });
const querySchema = z.object({ operating_company_id: z.string().uuid() });
const historyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const patchSchema = z
  .object({
    free_time_minutes: z.number().int().min(0).max(1440).optional(),
    detention_rate_per_hour: z.number().min(0).max(9999.99).optional(),
    detention_currency: z.enum(["USD", "MXN", "CAD"]).optional(),
    detention_requires_approval: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function isManagerPlus(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager";
}

export async function registerCustomerFreeTimeDetentionRoutes(app: FastifyInstance) {
  app.get("/api/v1/customers/:uuid/free-time-detention", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = paramsSchema.safeParse(req.params ?? {});
    const query = querySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const terms = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const inScopeCustomer = await assertCustomerScope(client, params.data.uuid, query.data.operating_company_id);
      if (!inScopeCustomer) return null;
      return getTerms(client, params.data.uuid, query.data.operating_company_id);
    });
    if (!terms) return reply.code(404).send({ error: "customer_not_found" });
    return { terms };
  });

  app.patch("/api/v1/customers/:uuid/free-time-detention", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isManagerPlus(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = paramsSchema.safeParse(req.params ?? {});
    const query = querySchema.safeParse(req.query ?? {});
    const body = patchSchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) return reply.code(400).send({ error: "validation_error" });

    const updated = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const inScopeCustomer = await assertCustomerScope(client, params.data.uuid, query.data.operating_company_id);
      if (!inScopeCustomer) return null;
      return updateTerms(client, params.data.uuid, query.data.operating_company_id, user.uuid, body.data);
    });
    if (!updated) return reply.code(404).send({ error: "customer_not_found" });
    return { terms: updated };
  });

  app.get("/api/v1/customers/:uuid/terms-history", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = paramsSchema.safeParse(req.params ?? {});
    const query = historyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const rows = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const inScopeCustomer = await assertCustomerScope(client, params.data.uuid, query.data.operating_company_id);
      if (!inScopeCustomer) return null;
      return listTermsHistory(client, params.data.uuid, query.data.operating_company_id, query.data.limit);
    });
    if (!rows) return reply.code(404).send({ error: "customer_not_found" });
    return { rows };
  });
}
