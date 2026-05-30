import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import {
  forecastReserveReleases,
  getFactorReserveBalances,
  getReserveBalanceHistory,
} from "./reserve.service.js";

const factorParamsSchema = z.object({
  factorId: z.string().uuid(),
});

const historyQuerySchema = companyQuerySchema.extend({
  from_date: z.string().datetime().optional(),
  to_date: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(250).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const forecastQuerySchema = companyQuerySchema.extend({
  lookahead_days: z.coerce.number().int().min(1).max(365).default(30),
});

export async function registerReserveRoutes(app: FastifyInstance) {
  app.get("/api/v1/factoring/reserves/balances", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const balances = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      getFactorReserveBalances(query.data.operating_company_id, { client })
    );

    return { balances };
  });

  app.get("/api/v1/factoring/reserves/:factorId/history", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = factorParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = historyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const history = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      getReserveBalanceHistory(
        query.data.operating_company_id,
        params.data.factorId,
        query.data.from_date,
        query.data.to_date,
        {
          client,
          limit: query.data.limit,
          offset: query.data.offset,
        }
      )
    );

    return history;
  });

  app.get("/api/v1/factoring/reserves/:factorId/forecast", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const params = factorParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = forecastQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const forecast = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      forecastReserveReleases(query.data.operating_company_id, params.data.factorId, query.data.lookahead_days, { client })
    );

    return forecast;
  });
}
