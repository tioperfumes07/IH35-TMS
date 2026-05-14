import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { createTtlCache } from "../lib/ttl-cache.js";

const querySchema = companyQuerySchema.extend({
  period_start: z.string().date(),
  period_end: z.string().date(),
  min_revenue_cents: z.coerce.number().int().min(0).optional(),
});

type ProfitFlag = "high_margin" | "low_margin" | "past_due" | "declining_revenue";

type CustomerRow = {
  customer_id: string;
  customer_name: string;
  revenue_cents: number;
  direct_cost_cents: number;
  gross_margin_cents: number;
  gross_margin_pct: number;
  load_count: number;
  avg_revenue_per_load_cents: number;
  ar_aging_balance_cents: number;
  days_since_last_load: number | null;
  flags: ProfitFlag[];
};

type CustomerProfitPayload = {
  period: { start: string; end: string };
  totals: {
    revenue_cents: number;
    direct_cost_cents: number;
    gross_margin_cents: number;
    gross_margin_pct: number;
    customer_count: number;
  };
  by_customer: CustomerRow[];
};

const cache = createTtlCache<CustomerProfitPayload>();

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / (86_400_000));
}

export async function registerCustomerProfitabilityRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/customer-profitability", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id: companyId, period_start: pStart, period_end: pEnd, min_revenue_cents } =
      parsed.data;
    const minRev = min_revenue_cents ?? 0;
    const cacheKey = `${companyId}:${pStart}:${pEnd}:${minRev}`;
    const hit = cache.get(cacheKey);
    if (hit) return hit;

    const payload = await withCompanyScope(user.uuid, companyId, async (client) => {
      const periodDays = Math.max(1, daysBetween(new Date(`${pStart}T00:00:00Z`), new Date(`${pEnd}T00:00:00Z`)) + 1);
      const prevEnd = new Date(`${pStart}T00:00:00Z`);
      prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setUTCDate(prevStart.getUTCDate() - (periodDays - 1));
      const prevStartStr = prevStart.toISOString().slice(0, 10);
      const prevEndStr = prevEnd.toISOString().slice(0, 10);

      const revRes = await client.query(
        `
          SELECT
            l.customer_id::text AS customer_id,
            COALESCE(SUM(COALESCE(l.rate_total_cents, 0)), 0)::text AS revenue_cents,
            COUNT(*)::text AS load_count,
            MAX(l.created_at)::text AS last_load_at
          FROM mdata.loads l
          WHERE l.operating_company_id = $1
            AND l.soft_deleted_at IS NULL
            AND l.created_at::date BETWEEN $2::date AND $3::date
          GROUP BY l.customer_id
        `,
        [companyId, pStart, pEnd]
      );

      const prevRevRes = await client.query(
        `
          SELECT l.customer_id::text AS customer_id, COALESCE(SUM(COALESCE(l.rate_total_cents, 0)), 0)::text AS revenue_cents
          FROM mdata.loads l
          WHERE l.operating_company_id = $1
            AND l.soft_deleted_at IS NULL
            AND l.created_at::date BETWEEN $2::date AND $3::date
          GROUP BY l.customer_id
        `,
        [companyId, prevStartStr, prevEndStr]
      );
      const prevRevRows = prevRevRes.rows as Array<{ customer_id: string; revenue_cents: string }>;
      const prevRevMap = new Map(prevRevRows.map((r) => [String(r.customer_id), num(r.revenue_cents)]));

      const costRes = await client.query(
        `
          SELECT l.customer_id::text AS customer_id, COALESCE(SUM(db.gross_amount_cents), 0)::text AS cost_cents
          FROM driver_finance.driver_bills db
          JOIN mdata.loads l ON l.id = db.load_id
          WHERE db.operating_company_id = $1
            AND l.soft_deleted_at IS NULL
            AND l.created_at::date BETWEEN $2::date AND $3::date
          GROUP BY l.customer_id
        `,
        [companyId, pStart, pEnd]
      ).catch(() => ({ rows: [] as Array<{ customer_id: string; cost_cents: string }> }));
      const costRows = costRes.rows as Array<{ customer_id: string; cost_cents: string }>;
      const costMap = new Map(costRows.map((r) => [String(r.customer_id), num(r.cost_cents)]));

      const arRes = await client.query(
        `
          SELECT
            i.customer_id::text AS customer_id,
            COALESCE(SUM(i.amount_open_cents), 0)::text AS open_cents,
            BOOL_OR(i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS past_due
          FROM accounting.invoices i
          WHERE i.operating_company_id = $1
            AND i.status IN ('sent', 'partial')
            AND i.voided_at IS NULL
            AND COALESCE(i.amount_open_cents, 0) > 0
          GROUP BY i.customer_id
        `,
        [companyId]
      ).catch(() => ({ rows: [] as Array<{ customer_id: string; open_cents: string; past_due: boolean }> }));
      const arRows = arRes.rows as Array<{ customer_id: string; open_cents: string; past_due: boolean }>;
      const arMap = new Map<string, { open: number; pastDue: boolean }>(
        arRows.map((r) => [String(r.customer_id), { open: num(r.open_cents), pastDue: Boolean(r.past_due) }])
      );

      const custRes = await client.query(
        `
          SELECT id::text AS customer_id, customer_name
          FROM mdata.customers
          WHERE operating_company_id = $1
        `,
        [companyId]
      );
      const custRows = custRes.rows as Array<{ customer_id: string; customer_name: string }>;
      const nameMap = new Map(custRows.map((r) => [String(r.customer_id), String(r.customer_name)]));

      const today = new Date();

      const revRows = revRes.rows as Array<{
        customer_id: string;
        revenue_cents: string;
        load_count: string;
        last_load_at: string | null;
      }>;

      const rows = revRows
        .map((r): CustomerRow => {
          const customerId = String(r.customer_id);
          const revenue = num(r.revenue_cents);
          const directCost = costMap.get(customerId) ?? 0;
          const margin = revenue - directCost;
          const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
          const loadCount = Math.floor(num(r.load_count));
          const lastLoadAt = r.last_load_at ? new Date(String(r.last_load_at)) : null;

          const flags: ProfitFlag[] = [];
          if (marginPct >= 25) flags.push("high_margin");
          if (revenue > 0 && marginPct <= 10) flags.push("low_margin");

          const ar = arMap.get(customerId);
          if (ar?.pastDue) flags.push("past_due");

          const prevRev = prevRevMap.get(customerId) ?? 0;
          if (prevRev > 0 && revenue < prevRev * 0.85) flags.push("declining_revenue");

          return {
            customer_id: customerId,
            customer_name: nameMap.get(customerId) ?? customerId,
            revenue_cents: revenue,
            direct_cost_cents: directCost,
            gross_margin_cents: margin,
            gross_margin_pct: Math.round(marginPct * 100) / 100,
            load_count: loadCount,
            avg_revenue_per_load_cents: Math.round(revenue / Math.max(loadCount, 1)),
            ar_aging_balance_cents: ar?.open ?? 0,
            days_since_last_load: lastLoadAt ? Math.max(0, daysBetween(lastLoadAt, today)) : null,
            flags,
          };
        })
        .filter((row) => row.revenue_cents >= minRev)
        .sort((a, b) => b.revenue_cents - a.revenue_cents);

      const totals = rows.reduce(
        (acc, row) => {
          acc.revenue_cents += row.revenue_cents;
          acc.direct_cost_cents += row.direct_cost_cents;
          acc.gross_margin_cents += row.gross_margin_cents;
          acc.customer_count += 1;
          return acc;
        },
        { revenue_cents: 0, direct_cost_cents: 0, gross_margin_cents: 0, customer_count: 0 }
      );

      const totalMarginPct = totals.revenue_cents > 0 ? (totals.gross_margin_cents / totals.revenue_cents) * 100 : 0;

      const body: CustomerProfitPayload = {
        period: { start: pStart, end: pEnd },
        totals: {
          revenue_cents: totals.revenue_cents,
          direct_cost_cents: totals.direct_cost_cents,
          gross_margin_cents: totals.gross_margin_cents,
          gross_margin_pct: Math.round(totalMarginPct * 100) / 100,
          customer_count: totals.customer_count,
        },
        by_customer: rows,
      };

      return body;
    });

    cache.set(cacheKey, payload, 60_000);
    return payload;
  });
}
