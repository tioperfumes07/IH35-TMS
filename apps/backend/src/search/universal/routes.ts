import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { universalSearch } from "./query.service.js";

const searchQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  q: z.string().min(1).max(200),
  types: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerUniversalSearchRoutes(app: FastifyInstance) {
  app.get("/api/search/universal", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = searchQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const entityTypes = parsed.data.types
      ? parsed.data.types.split(",").map((t) => t.trim()).filter(Boolean)
      : null;

    const results = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [
        parsed.data.operating_company_id,
      ]);
      return universalSearch(client, parsed.data.operating_company_id, parsed.data.q, {
        limit: parsed.data.limit,
        entity_types: entityTypes,
      });
    });

    return reply.send({ results, count: results.length });
  });
}
