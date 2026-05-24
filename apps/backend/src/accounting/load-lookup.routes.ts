import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { suggestLoadForExpense } from "./load-lookup.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  trailer_id: z.string().uuid().optional(),
  transaction_date: z.string().min(10).max(10),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerExpenseLoadLookupRoutes(app: FastifyInstance) {
  app.get("/api/v1/expenses/suggest-load", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }
    await assertCompanyMembership(user.uuid, parsed.data.operating_company_id);

    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [parsed.data.operating_company_id]);
      return suggestLoadForExpense(client, parsed.data);
    });

    return reply.send({ data: result });
  });
}


export default fp(async (app) => {
  await registerExpenseLoadLookupRoutes(app);
}, { name: "accounting.registerExpenseLoadLookupRoutes" });
