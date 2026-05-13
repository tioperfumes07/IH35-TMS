import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { getSamsaraConfigForCompany, toPublicConfig } from "./samsara.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function currentOfficeUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  const user = req.user as { uuid: string; role: string };
  if (user.role === "Driver") {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

export async function registerSamsaraHealthRoutes(app: FastifyInstance) {
  app.get("/api/v1/integrations/samsara/health", async (req, reply) => {
    const user = currentOfficeUser(req, reply);
    if (!user) return;

    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    const oc = parsed.data.operating_company_id;
    const row = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${oc}'`);
      return getSamsaraConfigForCompany(client, oc);
    });
    const pub = toPublicConfig(row);
    return {
      is_configured: pub.is_configured,
      is_enabled: pub.is_enabled,
      last_health_status: pub.last_health_status,
      last_health_check_at: pub.last_health_check_at,
      last_error: pub.last_error,
    };
  });
}
