import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { checkAllMappings, persistFindings } from "./driver-vendor-mapping.js";

let latestSnapshot: { scanned_at: string; findings: Awaited<ReturnType<typeof checkAllMappings>> } | null = null;

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerDriverVendorMappingIntegrityRoutes(app: FastifyInstance) {
  app.get("/api/integrations/integrity/driver-vendor-mapping", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    return { snapshot: latestSnapshot };
  });

  app.post("/api/integrations/integrity/driver-vendor-mapping/scan", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const body = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error" });

    const findings = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.data.operating_company_id]);
      const result = await checkAllMappings(client);
      await persistFindings(client, body.data.operating_company_id, result);
      return result;
    });
    latestSnapshot = { scanned_at: new Date().toISOString(), findings };
    return { findings };
  });
}
