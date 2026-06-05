import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import { getPrefs, updatePrefs } from "../../identity/user-preferences.service.js";

const tenantQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
});

const patchBodySchema = z.object({
  locale_preference: z.enum(["en", "es"]),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function pickLocalePreference(preferences: Record<string, unknown>) {
  const locale = preferences.locale_preference;
  if (locale === "en" || locale === "es") return locale;
  return "en";
}

export async function registerUserLocalePreferenceRoutes(app: FastifyInstance) {
  app.get("/api/v1/users/preferences/locale", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsedQuery = tenantQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: "validation_error", details: parsedQuery.error.flatten() });
    }
    const preferences = await getPrefs(user.uuid, parsedQuery.data.operating_company_id ?? null);
    return {
      locale_preference: pickLocalePreference(preferences),
    };
  });

  app.patch("/api/v1/users/preferences/locale", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsedQuery = tenantQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: "validation_error", details: parsedQuery.error.flatten() });
    }
    const parsedBody = patchBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return reply.code(400).send({ error: "validation_error", details: parsedBody.error.flatten() });
    }
    const preferences = await updatePrefs(
      user.uuid,
      { locale_preference: parsedBody.data.locale_preference },
      parsedQuery.data.operating_company_id ?? null
    );
    return {
      locale_preference: pickLocalePreference(preferences),
    };
  });
}
