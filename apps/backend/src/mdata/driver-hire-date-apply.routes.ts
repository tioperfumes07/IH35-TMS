import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { applySamsaraHireDateEstimates } from "../integrations/samsara/samsara-hire-date.service.js";

// Owner-triggered hire-date gap-fill. Deliberately SEPARATE from the read-only hos-driver-map preview block
// (which is guard-enforced write-free). Fills mdata.drivers.hire_date from the Samsara createdAtTime already
// in raw_payload ONLY where it's empty (file/HR date wins), tagged hire_date_source='samsara_estimate'.
const bodySchema = z.object({ operating_company_id: z.string().uuid() });

export async function registerDriverHireDateApplyRoutes(app: FastifyInstance) {
  app.post("/api/v1/telematics/driver-hire-date/apply", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return;
    const user = req.user as { uuid: string; role: string };
    if (!["Owner", "Administrator"].includes(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = bodySchema.safeParse((req.body as Record<string, unknown>) ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const oc = parsed.data.operating_company_id;

    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [oc]);
      return applySamsaraHireDateEstimates(client, oc, user.uuid);
    });
    return reply.send({ operating_company_id: oc, ...result });
  });
}
