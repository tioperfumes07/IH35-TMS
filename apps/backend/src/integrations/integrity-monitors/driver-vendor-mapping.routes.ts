import { setScopedCompanyContext } from "../../_helpers/scoped-company-context.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { checkAllMappings, persistFindings } from "./driver-vendor-mapping.js";

type MappingSnapshot = { scanned_at: string; findings: Awaited<ReturnType<typeof checkAllMappings>> };
const latestSnapshotsByCompany = new Map<string, MappingSnapshot>();

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerDriverVendorMappingIntegrityRoutes(app: FastifyInstance) {
  app.get("/api/integrations/integrity/driver-vendor-mapping", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });
    await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, query.data.operating_company_id);
    });
    return { snapshot: latestSnapshotsByCompany.get(query.data.operating_company_id) ?? null };
  });

  app.post("/api/integrations/integrity/driver-vendor-mapping/scan", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const body = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error" });

    const findings = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, body.data.operating_company_id);
      const result = await checkAllMappings(client, body.data.operating_company_id);
      await persistFindings(client, body.data.operating_company_id, result);
      return result;
    });
    latestSnapshotsByCompany.set(body.data.operating_company_id, { scanned_at: new Date().toISOString(), findings });
    return { findings };
  });
}
