import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireDriverSession } from "./auth.js";

const updateBodySchema = z.object({
  preferred_language: z.enum(["en", "es"]),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerDriverPreferencesRoutes(app: FastifyInstance) {
  app.get("/api/v1/driver/preferences/language", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const preferredLanguage = req.driver?.preferred_language ?? "en";
    return { preferred_language: preferredLanguage };
  });

  app.patch("/api/v1/driver/preferences/language", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    if (!req.user || !req.driver) return reply.code(403).send({ error: "forbidden" });
    const parsed = updateBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const updated = await withCurrentUser(req.user.uuid, async (client) => {
      const res = await client.query<{ preferred_language: "en" | "es" }>(
        `
          UPDATE identity.users
          SET preferred_language = $2
          WHERE id = $1
          RETURNING preferred_language
        `,
        [req.user?.uuid, parsed.data.preferred_language]
      );
      return res.rows[0] ?? null;
    });
    if (!updated) return reply.code(404).send({ error: "driver_user_not_found" });
    req.driver.preferred_language = updated.preferred_language;
    return updated;
  });
}
