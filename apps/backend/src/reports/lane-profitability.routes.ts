import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import {
  getLaneLoadDetails,
  readLaneProfitabilityCache,
  refreshLaneProfitabilityCache,
  resolveLanePeriod,
  type LaneSummary,
} from "./lane-profitability.service.js";

const listQuerySchema = companyQuerySchema.extend({
  period: z.enum(["YTD", "quarter", "month", "custom"]).default("YTD"),
  start: z.string().date().optional(),
  end: z.string().date().optional(),
});

const detailQuerySchema = companyQuerySchema.extend({
  period_start: z.string().date(),
  period_end: z.string().date(),
  origin_city: z.string().min(1),
  origin_state: z.string().min(1),
  destination_city: z.string().min(1),
  destination_state: z.string().min(1),
});

type LaneProfitabilityResponse = {
  period: { start: string; end: string; label: string };
  totals: {
    load_count: number;
    total_revenue_cents: number;
    gross_profit_cents: number;
    lane_count: number;
  };
  most_profitable_lane: LaneSummary | null;
  least_profitable_lane: LaneSummary | null;
  lanes: LaneSummary[];
  source: "cache" | "computed";
  computed_at: string | null;
};

function buildTotals(lanes: LaneSummary[]) {
  return lanes.reduce(
    (acc, lane) => {
      acc.load_count += lane.load_count;
      acc.total_revenue_cents += lane.total_revenue_cents;
      acc.gross_profit_cents += lane.gross_profit_cents;
      acc.lane_count += 1;
      return acc;
    },
    { load_count: 0, total_revenue_cents: 0, gross_profit_cents: 0, lane_count: 0 }
  );
}

export async function registerLaneProfitabilityRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/lane-profitability", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id: companyId, period, start, end } = parsed.data;
    const bounds = resolveLanePeriod(period, start, end);
    if (period === "custom" && (!start || !end)) {
      return reply.status(400).send({ error: "Custom period requires start and end dates" });
    }

    const payload = await withCompanyScope(user.uuid, companyId, async (client) => {
      const cached = await readLaneProfitabilityCache(client, companyId, bounds.start, bounds.end);
      let lanes = cached.lanes;
      let source: "cache" | "computed" = "cache";
      let computedAt = cached.computed_at;

      if (cached.stale || lanes.length === 0) {
        await refreshLaneProfitabilityCache(client, companyId, bounds.start, bounds.end);
        const refreshed = await readLaneProfitabilityCache(client, companyId, bounds.start, bounds.end);
        lanes = refreshed.lanes;
        source = "computed";
        computedAt = refreshed.computed_at;
      }

      const profitable = [...lanes].sort((a, b) => b.gross_profit_cents - a.gross_profit_cents);
      const body: LaneProfitabilityResponse = {
        period: { start: bounds.start, end: bounds.end, label: period },
        totals: buildTotals(lanes),
        most_profitable_lane: profitable[0] ?? null,
        least_profitable_lane: profitable.length > 1 ? profitable[profitable.length - 1] : profitable[0] ?? null,
        lanes,
        source,
        computed_at: computedAt,
      };
      return body;
    });

    return payload;
  });

  app.get("/api/v1/reports/lane-profitability/loads", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const parsed = detailQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const {
      operating_company_id: companyId,
      period_start: periodStart,
      period_end: periodEnd,
      origin_city: originCity,
      origin_state: originState,
      destination_city: destinationCity,
      destination_state: destinationState,
    } = parsed.data;

    return withCompanyScope(user.uuid, companyId, async (client) =>
      getLaneLoadDetails(
        client,
        companyId,
        periodStart,
        periodEnd,
        originCity,
        originState,
        destinationCity,
        destinationState
      )
    );
  });
}
