import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { getPrefs, updatePrefs } from "../identity/user-preferences.service.js";

const tableIdQuerySchema = z.object({
  table_id: z.string().trim().min(1).max(120),
});

const patchBodySchema = z.object({
  table_id: z.string().trim().min(1).max(120),
  column_widths: z.record(z.string(), z.number().min(60).max(800)),
});

const tenantQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function readTableWidths(preferences: Record<string, unknown>, tableId: string) {
  const root = preferences.table_column_widths;
  if (!root || typeof root !== "object") return {};
  const widths = (root as Record<string, unknown>)[tableId];
  if (!widths || typeof widths !== "object") return {};
  return widths as Record<string, number>;
}

export async function registerTableColumnPreferencesRoutes(app: FastifyInstance) {
  app.get("/api/v1/users/me/table-preferences", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsedQuery = tableIdQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: "validation_error", details: parsedQuery.error.flatten() });
    }
    const tenant = tenantQuerySchema.safeParse(req.query ?? {});
    const preferences = await getPrefs(user.uuid, tenant.success ? tenant.data.operating_company_id ?? null : null);
    return {
      table_id: parsedQuery.data.table_id,
      column_widths: readTableWidths(preferences, parsedQuery.data.table_id),
    };
  });

  app.patch("/api/v1/users/me/table-preferences", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = patchBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }
    const tenant = tenantQuerySchema.safeParse(req.query ?? {});
    const preferences = await updatePrefs(
      user.uuid,
      {
        table_column_widths: {
          [parsed.data.table_id]: parsed.data.column_widths,
        },
      },
      tenant.success ? tenant.data.operating_company_id ?? null : null
    );
    return {
      table_id: parsed.data.table_id,
      column_widths: readTableWidths(preferences, parsed.data.table_id),
    };
  });
}
