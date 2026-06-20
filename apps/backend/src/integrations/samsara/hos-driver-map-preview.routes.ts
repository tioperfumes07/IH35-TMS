// HOS-MAP preview endpoint — READ ONLY. Returns the proposed driver -> Samsara-id map for Jorge to eyeball
// BEFORE any write. Writes nothing. The actual `UPDATE mdata.drivers SET samsara_driver_id` is a separate,
// Jorge-approved step on the rows he confirms — there is intentionally no write endpoint here.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { previewDriverSamsaraMap } from "./hos-driver-map-preview.service.js";

const querySchema = z.object({ operating_company_id: z.string().uuid() });

function currentOfficeAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  const user = req.user as { uuid: string; role: string };
  if (!["Owner", "Administrator"].includes(user.role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

export async function registerHosDriverMapPreviewRoutes(app: FastifyInstance) {
  app.get("/api/v1/telematics/hos-driver-map/preview", async (req, reply) => {
    const user = currentOfficeAdmin(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const oc = parsed.data.operating_company_id;

    const preview = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${oc}'`);
      return previewDriverSamsaraMap(client, oc);
    });
    return reply.send(preview);
  });
}
