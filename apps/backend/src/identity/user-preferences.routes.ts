import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { getPrefs, updatePrefs } from "./user-preferences.service.js";

const patchSchema = z.object({
  preferences: z.record(z.string(), z.unknown()),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerUserPreferencesRoutes(app: FastifyInstance) {
  app.get("/api/v1/user/preferences", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const preferences = await getPrefs(user.uuid);
    return { preferences };
  });

  app.patch("/api/v1/user/preferences", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = patchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }
    const preferences = await updatePrefs(user.uuid, parsed.data.preferences);
    return { preferences };
  });
}
