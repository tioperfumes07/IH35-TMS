/**
 * ENG fill-not-shell — Profitability → By Type.
 * Groups entity-scoped loads by catalogs.load_trailer_equipment.code for a period.
 * Revenue = load rate_total; cost = driver bill gross + fuel.fuel_transactions on the load
 * (same sources as lane profitability). Cancelled / soft-deleted / voided excluded.
 */
import type { FastifyInstance } from "fastify";
import { canonicalNotCancelledLoadClause } from "../dispatch/canonical-active-load-set.js";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, dateRangeOrderError, validationError, withCompanyScope } from "./shared.js";

const querySchema = companyQuerySchema.extend({
  period_start: z.string().date(),
  period_end: z.string().date(),
});

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export type EquipmentTypeProfitRow = {
  equipment_code: string;
  equipment_label: string;
  load_count: number;
  miles: number;
  revenue_cents: number;
  direct_cost_cents: number;
  gross_margin_cents: number;
  rev_per_mile_cents: number | null;
  cost_per_mile_cents: number | null;
  margin_per_mile_cents: number | null;
};

export async function registerEquipmentTypeProfitabilityRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/equipment-type-profitability", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    if (parsed.data.period_start > parsed.data.period_end) return dateRangeOrderError(reply, "period_start", "period_end");

    const { operating_company_id: companyId, period_start: pStart, period_end: pEnd } = parsed.data;

    return withCompanyScope(user.uuid, companyId, async (client) => {
      const res = await client.query(
        `
        WITH loads AS (
          SELECT l.id,
                 l.load_trailer_equipment_id,
                 COALESCE(l.rate_total_cents, 0)::bigint AS revenue_cents,
                 COALESCE(l.miles_practical, l.miles_driven_actual, 0)::numeric AS miles
            FROM mdata.loads l
           WHERE l.operating_company_id = $1::uuid
             AND l.soft_deleted_at IS NULL
             AND l.voided_at IS NULL
             AND ${canonicalNotCancelledLoadClause("l")}
             AND l.created_at::date BETWEEN $2::date AND $3::date
        ),
        bills AS (
          SELECT db.load_id, COALESCE(SUM(db.gross_amount_cents), 0)::bigint AS bill_cents
            FROM driver_finance.driver_bills db
           WHERE db.operating_company_id = $1::uuid
             AND db.load_id IN (SELECT id FROM loads)
             -- Live driver pay only (Codex batch54): void/voided bills are not cost.
             AND db.voided_at IS NULL
             AND db.status NOT IN ('void', 'voided')
           GROUP BY db.load_id
        ),
        fuel AS (
          SELECT ft.load_id, COALESCE(SUM(ROUND(ft.total_cost::numeric * 100)), 0)::bigint AS fuel_cents
            FROM fuel.fuel_transactions ft
           WHERE ft.operating_company_id = $1::uuid
             AND ft.load_id IN (SELECT id FROM loads)
           GROUP BY ft.load_id
        )
        SELECT COALESCE(lte.code, 'UNKNOWN') AS equipment_code,
               COALESCE(lte.display_name, lte.code, 'Unknown') AS equipment_label,
               COUNT(*)::int AS load_count,
               COALESCE(SUM(loads.miles), 0)::float8 AS miles,
               COALESCE(SUM(loads.revenue_cents), 0)::bigint AS revenue_cents,
               COALESCE(SUM(COALESCE(bills.bill_cents, 0) + COALESCE(fuel.fuel_cents, 0)), 0)::bigint AS direct_cost_cents
          FROM loads
          LEFT JOIN catalogs.load_trailer_equipment lte
            ON lte.id = loads.load_trailer_equipment_id
           AND lte.operating_company_id = $1::uuid
          LEFT JOIN bills ON bills.load_id = loads.id
          LEFT JOIN fuel ON fuel.load_id = loads.id
         GROUP BY 1, 2
         ORDER BY SUM(loads.revenue_cents) DESC
        `,
        [companyId, pStart, pEnd]
      );

      const by_type: EquipmentTypeProfitRow[] = (res.rows as Array<Record<string, unknown>>).map((r) => {
        const miles = num(r.miles);
        const revenue = num(r.revenue_cents);
        const cost = num(r.direct_cost_cents);
        const margin = revenue - cost;
        const perMi = (cents: number) => (miles > 0 ? Math.round(cents / miles) : null);
        return {
          equipment_code: String(r.equipment_code),
          equipment_label: String(r.equipment_label),
          load_count: num(r.load_count),
          miles,
          revenue_cents: revenue,
          direct_cost_cents: cost,
          gross_margin_cents: margin,
          rev_per_mile_cents: perMi(revenue),
          cost_per_mile_cents: perMi(cost),
          margin_per_mile_cents: perMi(margin),
        };
      });

      const totals = by_type.reduce(
        (acc, row) => {
          acc.load_count += row.load_count;
          acc.miles += row.miles;
          acc.revenue_cents += row.revenue_cents;
          acc.direct_cost_cents += row.direct_cost_cents;
          return acc;
        },
        { load_count: 0, miles: 0, revenue_cents: 0, direct_cost_cents: 0 }
      );
      return {
        period: { start: pStart, end: pEnd },
        totals: {
          ...totals,
          gross_margin_cents: totals.revenue_cents - totals.direct_cost_cents,
          type_count: by_type.length,
        },
        by_type,
      };
    });
  });
}
