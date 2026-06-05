import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { listLaunchToggles, toggleCarrierLaunch } from "./launch-toggles.js";

const carrierIdParam = z.object({ carrier_id: z.string().uuid() });

const actionBodySchema = z.object({
  confirm: z.literal(true),
  notes: z.string().trim().max(2000).optional(),
});

function currentOwner(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  const user = req.user;
  if (!user || user.role !== "Owner") {
    void reply.code(403).send({ error: "owner_only" });
    return null;
  }
  return user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerLaunchToggleRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/launch-toggles", async (req, reply) => {
    const user = currentOwner(req, reply);
    if (!user) return;

    const toggles = await withCurrentUser(user.uuid, async (client) => listLaunchToggles(client));
    return { toggles };
  });

  app.post<{ Params: { carrier_id: string } }>(
    "/api/v1/admin/launch-toggles/:carrier_id/launch",
    async (req, reply) => {
      const user = currentOwner(req, reply);
      if (!user) return;
      const params = carrierIdParam.safeParse(req.params ?? {});
      if (!params.success) return sendValidationError(reply, params.error);
      const body = actionBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);

      try {
        const result = await withCurrentUser(user.uuid, async (client) =>
          toggleCarrierLaunch(client, user.uuid, params.data.carrier_id, "launch", body.data.notes)
        );
        return reply.code(200).send(result);
      } catch (err) {
        const msg = String((err as Error)?.message ?? err);
        if (msg.includes("carrier_not_found")) return reply.code(404).send({ error: "carrier_not_found" });
        if (msg.includes("already_launched")) return reply.code(409).send({ error: "already_launched" });
        throw err;
      }
    }
  );

  app.post<{ Params: { carrier_id: string } }>(
    "/api/v1/admin/launch-toggles/:carrier_id/rollback",
    async (req, reply) => {
      const user = currentOwner(req, reply);
      if (!user) return;
      const params = carrierIdParam.safeParse(req.params ?? {});
      if (!params.success) return sendValidationError(reply, params.error);
      const body = actionBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);

      try {
        const result = await withCurrentUser(user.uuid, async (client) =>
          toggleCarrierLaunch(client, user.uuid, params.data.carrier_id, "rollback", body.data.notes)
        );
        return reply.code(200).send(result);
      } catch (err) {
        const msg = String((err as Error)?.message ?? err);
        if (msg.includes("carrier_not_found")) return reply.code(404).send({ error: "carrier_not_found" });
        if (msg.includes("already_hidden")) return reply.code(409).send({ error: "already_hidden" });
        throw err;
      }
    }
  );
}
