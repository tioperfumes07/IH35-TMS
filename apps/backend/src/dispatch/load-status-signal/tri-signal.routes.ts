/**
 * GAP-57 / CAP-5 — Dispatch board tri-signal routes.
 * Base path: /api/dispatch/load-status-signal
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { computeTriSignal, computeTriSignalsForActiveLoads } from "./tri-signal.service.js";

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

const companyQuery = z.object({
  operating_company_id: z.string().uuid(),
});

export async function registerTriSignalRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/dispatch/load-status-signal/active-loads", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuery.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const signals = await withCurrentUser(user.uuid, async (client) =>
      computeTriSignalsForActiveLoads(client, parsed.data.operating_company_id)
    );
    return reply.send({ signals });
  });

  app.get("/api/dispatch/load-status-signal/:load_uuid", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = z.object({ load_uuid: z.string().uuid() }).safeParse(req.params ?? {});
    const parsed = companyQuery.safeParse(req.query ?? {});
    if (!params.success || !parsed.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    const signal = await withCurrentUser(user.uuid, async (client) =>
      computeTriSignal(client, parsed.data.operating_company_id, params.data.load_uuid)
    );
    if (!signal) return reply.code(404).send({ error: "load_not_found" });
    return reply.send({ signal });
  });
}
