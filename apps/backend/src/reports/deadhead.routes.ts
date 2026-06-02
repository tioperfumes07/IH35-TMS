import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getBackhaulSuggestions, getDeadheadReport, refreshDeadheadCache } from "./deadhead.service.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

const reportQuerySchema = companyQuerySchema.extend({
  period: z.enum(["last_4_weeks", "last_12_weeks", "YTD"]).default("last_4_weeks"),
  unit_id: z.string().uuid().optional(),
});

const suggestionsParamsSchema = z.object({
  unit_id: z.string().uuid(),
});

export async function registerDeadheadRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/deadhead", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const parsed = reportQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const payload = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) =>
      getDeadheadReport(client, parsed.data.operating_company_id, parsed.data.period, parsed.data.unit_id)
    );

    return payload;
  });

  app.get("/api/v1/reports/deadhead/suggestions/:unit_id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = suggestionsParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      getBackhaulSuggestions(client, query.data.operating_company_id, params.data.unit_id)
    );

    return payload;
  });

  app.post("/api/v1/reports/deadhead/refresh", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const updated = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) =>
      refreshDeadheadCache(client, parsed.data.operating_company_id)
    );

    return { ok: true, rows_refreshed: updated };
  });
}

export { refreshDeadheadCache };
