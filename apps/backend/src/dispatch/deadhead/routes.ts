import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import { sendZodValidation } from "../../lib/zod-http-error.js";
import { DEFAULT_MAX_DEADHEAD_MILES, findBestLoadForUnit } from "./optimizer.service.js";

const nextLoadQuery = z.object({
  operating_company_id: z.string().uuid(),
  unit: z.string().uuid(),
  after: z.string().datetime({ offset: true }),
  max_deadhead_miles: z.coerce.number().min(1).max(500).optional(),
  drop_latitude: z.coerce.number().min(-90).max(90).optional(),
  drop_longitude: z.coerce.number().min(-180).max(180).optional(),
  drop_city: z.string().trim().max(120).optional(),
  drop_state: z.string().trim().max(120).optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  const role = String(req.user?.role ?? "");
  if (!["Owner", "Administrator", "Manager", "Dispatcher"].includes(role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return req.user!;
}

export async function registerDeadheadOptimizerRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/deadhead/next-load-suggestions", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = nextLoadQuery.safeParse(req.query ?? {});
    if (!parsed.success) return sendZodValidation(reply, parsed.error);

    const suggestions = await findBestLoadForUnit(user.uuid, {
      operating_company_id: parsed.data.operating_company_id,
      unit_uuid: parsed.data.unit,
      after_delivery_at: parsed.data.after,
      max_deadhead_miles: parsed.data.max_deadhead_miles ?? DEFAULT_MAX_DEADHEAD_MILES,
      drop_latitude: parsed.data.drop_latitude,
      drop_longitude: parsed.data.drop_longitude,
      drop_city: parsed.data.drop_city,
      drop_state: parsed.data.drop_state,
    });

    return {
      unit_uuid: parsed.data.unit,
      after_delivery_at: parsed.data.after,
      max_deadhead_miles: parsed.data.max_deadhead_miles ?? DEFAULT_MAX_DEADHEAD_MILES,
      suggestions,
    };
  });
}
