import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCompanyScope } from "../../accounting/shared.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { sendZodValidation } from "../../lib/zod-http-error.js";
import { syncSamsaraDriversMaster, syncSamsaraVehiclesMaster, syncSamsaraTrailersMaster } from "./samsara-master-sync.service.js";

function officeRole(role: string) {
  return ["Owner", "Administrator", "Manager", "Dispatcher", "Accountant", "Safety"].includes(role);
}

const bodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

export async function registerSamsaraMasterSyncRoutes(app: FastifyInstance) {
  app.post("/api/v1/integrations/samsara/drivers/sync", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return;
    const user = req.user as { uuid: string; role: string };
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendZodValidation(reply, parsed.error);

    const out = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      return syncSamsaraDriversMaster(client, parsed.data.operating_company_id);
    });
    return out;
  });

  app.post("/api/v1/integrations/samsara/assets/sync", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return;
    const user = req.user as { uuid: string; role: string };
    if (!officeRole(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendZodValidation(reply, parsed.error);

    const out = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const vehicles = await syncSamsaraVehiclesMaster(client, parsed.data.operating_company_id);
      const trailers = await syncSamsaraTrailersMaster(client, parsed.data.operating_company_id);
      return {
        added: vehicles.added + trailers.added,
        updated: vehicles.updated + trailers.updated,
        removed: vehicles.removed + trailers.removed,
        errors: [...vehicles.errors, ...trailers.errors],
        vehicles,
        trailers,
      };
    });
    return out;
  });
}
