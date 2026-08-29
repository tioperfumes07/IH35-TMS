import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, dateRangeOrderError, reportBasisSchema, validationError, withCompanyScope } from "./shared.js";
import { createTtlCache } from "../lib/ttl-cache.js";

const querySchema = companyQuerySchema.extend({
  from: z.string().date(),
  to: z.string().date(),
  basis: reportBasisSchema,
});

type DispatchMarginRow = {
  load_id: string;
  load_number: string | null;
  customer_id: string;
  customer_name: string | null;
  revenue_cents: number;
  driver_pay_cents: number;
  fuel_cents: number;
  tolls_cents: number;
  chargebacks_cents: number;
  direct_cost_cents: number;
  margin_cents: number;
  margin_pct: number;
};

type DispatchMarginPayload = {
  basis: "cash" | "accrual";
  period: { start: string; end: string };
  totals: {
    revenue_cents: number;
    direct_cost_cents: number;
    margin_cents: number;
    margin_pct: number;
    load_count: number;
  };
  rows: DispatchMarginRow[];
};

const cache = createTtlCache<DispatchMarginPayload>();

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function registerDispatchMarginRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/dispatch-margin", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    if (parsed.data.from > parsed.data.to) return dateRangeOrderError(reply, "from", "to");

    const { operating_company_id: companyId, from, to, basis } = parsed.data;
    const cacheKey = `${companyId}:${from}:${to}:${basis}`;
    const hit = cache.get(cacheKey);
    if (hit) return hit;

    const payload = await withCompanyScope(user.uuid, companyId, async (client) => {
      // DISP-PHANTOM-CLASS: the cash-basis filter read l.completed_at AND l.delivered_at — NEITHER
      // exists on mdata.loads (verified on prod 2026-07-27: the table carries created_at and
      // updated_at only). So every cash-basis dispatch-margin report threw 42703 and returned a 500,
      // while the accrual basis — which only touches l.created_at — worked. A report that silently
      // works on one basis and 500s on the other is exactly the kind of half-dead surface this audit
      // exists to find. Delivery time lives on the last stop_type='delivery' stop's
      // actual_departure_at (truck-release basis, consistent with booking-gap.service.ts).
      const dateFilter =
        basis === "cash"
          ? `COALESCE(
               (SELECT ls.actual_departure_at
                  FROM mdata.load_stops ls
                 WHERE ls.load_id = l.id
                   AND ls.stop_type = 'delivery'
                   AND ls.actual_departure_at IS NOT NULL
                 ORDER BY ls.actual_departure_at DESC
                 LIMIT 1),
               l.updated_at,
               l.created_at
             )::date BETWEEN $2::date AND $3::date`
          : `l.created_at::date BETWEEN $2::date AND $3::date`;

      // CODER-14 500-safety: driver_finance.settlement_lines has NO load_id (§4) — it links to a load
      // via driver_settlements, not directly. The old tolls CTE joined sl.load_id → 42703 → 500. Guard
      // the column: only attribute per-load tolls when settlement_lines.load_id exists (degrade to 0
      // otherwise). Forward-compatible — when the Tier-1 load_id-on-settlement work lands, this
      // re-activates automatically with no further change.
      const settlementHasLoadId =
        (
          await client.query(
            `SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'driver_finance' AND table_name = 'settlement_lines' AND column_name = 'load_id'
             LIMIT 1`
          )
        ).rows.length > 0;
      const tollsCte = settlementHasLoadId
        ? `tolls AS (
            SELECT sl.load_id, COALESCE(SUM(ROUND(sl.amount::numeric * 100)), 0)::bigint AS tolls_cents
            FROM driver_finance.settlement_lines sl
            INNER JOIN load_scope ls ON ls.id = sl.load_id
            WHERE sl.line_type::text ILIKE '%toll%'
            GROUP BY sl.load_id
          )`
        : `tolls AS (
            SELECT NULL::uuid AS load_id, 0::bigint AS tolls_cents WHERE false
          )`;

      const res = await client.query(
        `
          WITH load_scope AS (
            SELECT
              l.id,
              l.load_number,
              l.customer_id::text,
              -- AUDIT-TRAIL-SUBJECT-LABEL-LOST-FOR-DEACTIVATED-ENTITIES: mdata.customers' FORCE RLS
              -- excludes deactivated-but-not-deleted rows for a non-bypass reader, so this LEFT JOIN
              -- alone left c.customer_name NULL ("Customer — not visible" on the FE) for any load
              -- whose customer was later deactivated, even though the load and its dollar figures are
              -- entirely real. Falls back to the canonical same-company label resolver (already proven
              -- at scale by invoices/payments/transaction-register.routes.ts) instead of widening RLS.
              COALESCE(c.customer_name, mdata.resolve_customer_label_same_company(l.customer_id, $1::uuid)) AS customer_name,
              COALESCE(l.rate_total_cents, 0)::bigint AS revenue_cents
            FROM mdata.loads l
            LEFT JOIN mdata.customers c ON c.id = l.customer_id
                                        AND c.operating_company_id = $1::uuid
            WHERE l.operating_company_id = $1::uuid
              AND l.soft_deleted_at IS NULL
              AND l.status IS DISTINCT FROM 'cancelled'
              AND ${dateFilter}
          ),
          pay AS (
            SELECT db.load_id, COALESCE(SUM(db.gross_amount_cents), 0)::bigint AS driver_pay_cents
            FROM driver_finance.driver_bills db
            INNER JOIN load_scope ls ON ls.id = db.load_id
            GROUP BY db.load_id
          ),
          fuel AS (
            SELECT ft.load_id, COALESCE(SUM(ROUND(ft.total_cost::numeric * 100)), 0)::bigint AS fuel_cents
            FROM fuel.fuel_transactions ft
            INNER JOIN load_scope ls ON ls.id = ft.load_id
            WHERE ft.operating_company_id = $1::uuid
            GROUP BY ft.load_id
          ),
          ${tollsCte},
          chargebacks AS (
            SELECT ac.load_id, COALESCE(SUM(ac.total_chargeback_cents), 0)::bigint AS chargebacks_cents
            FROM driver_finance.abandonment_chargebacks ac
            INNER JOIN load_scope ls ON ls.id = ac.load_id
            WHERE ac.operating_company_id = $1::uuid
            GROUP BY ac.load_id
          )
          SELECT
            ls.id::text AS load_id,
            ls.load_number,
            ls.customer_id,
            ls.customer_name,
            ls.revenue_cents::text AS revenue_cents,
            COALESCE(pay.driver_pay_cents, 0)::text AS driver_pay_cents,
            COALESCE(fuel.fuel_cents, 0)::text AS fuel_cents,
            COALESCE(tolls.tolls_cents, 0)::text AS tolls_cents,
            COALESCE(chargebacks.chargebacks_cents, 0)::text AS chargebacks_cents
          FROM load_scope ls
          LEFT JOIN pay ON pay.load_id = ls.id
          LEFT JOIN fuel ON fuel.load_id = ls.id
          LEFT JOIN tolls ON tolls.load_id = ls.id
          LEFT JOIN chargebacks ON chargebacks.load_id = ls.id
          ORDER BY ls.revenue_cents DESC
        `,
        [companyId, from, to]
      );

      const rows: DispatchMarginRow[] = (res.rows as Array<Record<string, string | null>>).map((row) => {
        const revenue = num(row.revenue_cents);
        const driverPay = num(row.driver_pay_cents);
        const fuelCents = num(row.fuel_cents);
        const tollsCents = num(row.tolls_cents);
        const chargebacksCents = num(row.chargebacks_cents);
        const directCost = driverPay + fuelCents + tollsCents + chargebacksCents;
        const margin = revenue - directCost;
        const marginPct = revenue > 0 ? Math.round((margin / revenue) * 10000) / 100 : 0;
        return {
          load_id: String(row.load_id),
          load_number: row.load_number,
          customer_id: String(row.customer_id),
          customer_name: row.customer_name,
          revenue_cents: revenue,
          driver_pay_cents: driverPay,
          fuel_cents: fuelCents,
          tolls_cents: tollsCents,
          chargebacks_cents: chargebacksCents,
          direct_cost_cents: directCost,
          margin_cents: margin,
          margin_pct: marginPct,
        };
      });

      const totals = rows.reduce(
        (acc, row) => {
          acc.revenue_cents += row.revenue_cents;
          acc.direct_cost_cents += row.direct_cost_cents;
          acc.margin_cents += row.margin_cents;
          acc.load_count += 1;
          return acc;
        },
        { revenue_cents: 0, direct_cost_cents: 0, margin_cents: 0, margin_pct: 0, load_count: 0 }
      );
      totals.margin_pct = totals.revenue_cents > 0 ? Math.round((totals.margin_cents / totals.revenue_cents) * 10000) / 100 : 0;

      return { basis, period: { start: from, end: to }, totals, rows };
    });

    cache.set(cacheKey, payload, 60_000);
    return payload;
  });
}
