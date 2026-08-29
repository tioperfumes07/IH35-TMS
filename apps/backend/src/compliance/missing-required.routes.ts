import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { resolveMissingRequired } from "./missing-required.service.js";
import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";

// DOC-REQ-2b — read-only endpoint powering the "Missing required: N" chip. Any authed user in the company
// may read it. No writes, no money.
const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  entity_kind: z.enum(["driver", "unit", "customer", "vendor"]),
  entity_id: z.string().uuid(),
});

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerMissingRequiredRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/compliance/missing-required",
    { config: { rateLimit: { max: 240, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authUser(req, reply);
      if (!user) return;
      const q = querySchema.safeParse(req.query ?? {});
      if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });

      const summary = await withCurrentUser(user.uuid, async (client) => {
        await setScopedCompanyContext(client, user.uuid, q.data.operating_company_id);
        return resolveMissingRequired(client as never, q.data.operating_company_id, q.data.entity_kind, q.data.entity_id);
      });
      return reply.send(summary);
    },
  );
}
