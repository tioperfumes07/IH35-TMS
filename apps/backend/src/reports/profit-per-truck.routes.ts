import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, parseMonthWindow, reportBasisSchema, validationError, withCompanyScope } from "./shared.js";
import { createTtlCache } from "../lib/ttl-cache.js";

const legacyQuerySchema = companyQuerySchema.extend({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  unit_id: z.string().uuid().optional(),
});

const periodQuerySchema = companyQuerySchema.extend({
  period_start: z.string().date(),
  period_end: z.string().date(),
  basis: reportBasisSchema,
});

type TruckFlag = "most_profitable" | "least_profitable" | "high_maintenance" | "underutilized";

type ProfitPerTruckExtended = {
  period: { start: string; end: string };
  basis?: "cash" | "accrual";
  totals: {
    revenue_cents: number;
    driver_pay_cents: number;
    fuel_cost_cents: number;
    maintenance_cost_cents: number;
    depreciation_cents: number;
    other_direct_cost_cents: number;
    net_profit_cents: number;
    truck_count: number;
  };
  by_truck: TruckAggRow[];
};

type TruckAggRow = {
  unit_id: string;
  unit_number: string;
  truck_type: string;
  revenue_cents: number;
  driver_pay_cents: number;
  fuel_cents: number;
  maintenance_cents: number;
  depreciation_cents: number;
  other_cents: number;
  net_profit_cents: number;
  margin_pct: number;
  load_count: number;
  miles_driven: number;
  revenue_per_mile_cents: number;
  cost_per_mile_cents: number;
  profit_per_mile_cents: number;
  primary_driver_id: string | null;
  primary_driver_name: string | null;
  flags: TruckFlag[];
};

type UnitSqlRow = {
  unit_id: string;
  unit_number: string;
  revenue_cents: string;
  miles_driven: string;
  load_count: string;
  truck_type: string;
  driver_pay_cents: string;
  maintenance_cents: string;
  primary_driver_id: string | null;
};

const extendedCache = createTtlCache<ProfitPerTruckExtended>();

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function registerProfitPerTruckRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/profit-per-truck", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const q = req.query ?? {};
    const periodParsed = periodQuerySchema.safeParse(q);
    if (periodParsed.success) {
      const { operating_company_id: companyId, period_start: pStart, period_end: pEnd, basis } = periodParsed.data;
      const cacheKey = `${companyId}:${pStart}:${pEnd}:${basis}`;
      const hit = extendedCache.get(cacheKey);
      if (hit) return hit;

      const payload = await withCompanyScope(user.uuid, companyId, async (client) => {
        const baseRes = await client.query(
          `
            WITH load_scope AS (
              SELECT
                l.id,
                l.assigned_unit_id,
                l.assigned_primary_driver_id,
                l.rate_total_cents,
                l.trailer_type,
                COALESCE(l.miles_practical, l.miles_shortest, 0)::bigint AS trip_miles
              FROM mdata.loads l
              WHERE l.operating_company_id = $1
                AND l.soft_deleted_at IS NULL
                AND l.assigned_unit_id IS NOT NULL
                AND l.created_at::date BETWEEN $2::date AND $3::date
            ),
            agg AS (
              SELECT
                ls.assigned_unit_id AS unit_id,
                COALESCE(SUM(ls.rate_total_cents), 0)::bigint AS revenue_cents,
                COALESCE(SUM(ls.trip_miles), 0)::bigint AS miles_driven,
                COUNT(*)::int AS load_count,
                MAX(ls.trailer_type::text) AS truck_type
              FROM load_scope ls
              GROUP BY ls.assigned_unit_id
            ),
            pay AS (
              SELECT l.assigned_unit_id AS unit_id, COALESCE(SUM(db.gross_amount_cents), 0)::bigint AS driver_pay_cents
              FROM driver_finance.driver_bills db
              JOIN load_scope l ON l.id = db.load_id
              GROUP BY l.assigned_unit_id
            ),
            maint AS (
              SELECT
                wo.unit_id AS unit_id,
                COALESCE(
                  SUM(
                    CASE
                      WHEN COALESCE(wo.updated_at, wo.opened_at)::date BETWEEN $2::date AND $3::date
                      THEN ROUND(COALESCE(wo.total_actual_cost, 0)::numeric * 100)::bigint
                      ELSE 0
                    END
                  ),
                  0
                )::bigint AS maintenance_cents
              FROM maintenance.work_orders wo
              WHERE wo.operating_company_id = $1
              GROUP BY wo.unit_id
            ),
            drivers AS (
              SELECT ls.assigned_unit_id AS unit_id, ls.assigned_primary_driver_id AS driver_id, COUNT(*)::int AS c
              FROM load_scope ls
              WHERE ls.assigned_primary_driver_id IS NOT NULL
              GROUP BY ls.assigned_unit_id, ls.assigned_primary_driver_id
            ),
            primary_pick AS (
              SELECT DISTINCT ON (unit_id)
                unit_id,
                driver_id
              FROM drivers
              ORDER BY unit_id, c DESC, driver_id ASC
            )
            SELECT
              u.id::text AS unit_id,
              u.unit_number,
              COALESCE(agg.revenue_cents, 0)::text AS revenue_cents,
              COALESCE(agg.miles_driven, 0)::text AS miles_driven,
              COALESCE(agg.load_count, 0)::text AS load_count,
              COALESCE(agg.truck_type::text, 'unknown') AS truck_type,
              COALESCE(pay.driver_pay_cents, 0)::text AS driver_pay_cents,
              COALESCE(maint.maintenance_cents, 0)::text AS maintenance_cents,
              pp.driver_id::text AS primary_driver_id
            FROM mdata.units u
            JOIN agg ON agg.unit_id = u.id
            LEFT JOIN pay ON pay.unit_id = u.id
            LEFT JOIN maint ON maint.unit_id = u.id
            LEFT JOIN primary_pick pp ON pp.unit_id = u.id
            WHERE u.deactivated_at IS NULL
          `,
          [companyId, pStart, pEnd]
        );

        const fuelRes = await client
          .query(
            `
              SELECT l.assigned_unit_id::text AS unit_id, COALESCE(SUM(ROUND(ft.total_cost::numeric * 100)), 0)::text AS fuel_cents
              FROM fuel.fuel_transactions ft
              JOIN mdata.loads l ON l.id = ft.load_id
              WHERE ft.operating_company_id = $1
                AND l.soft_deleted_at IS NULL
                AND l.created_at::date BETWEEN $2::date AND $3::date
                AND l.assigned_unit_id IS NOT NULL
              GROUP BY l.assigned_unit_id
            `,
            [companyId, pStart, pEnd]
          )
          .catch(() => ({ rows: [] as Array<{ unit_id: string; fuel_cents: string }> }));

        const fuelRows = fuelRes.rows as Array<{ unit_id: string; fuel_cents: string }>;
        const fuelMap = new Map<string, number>(fuelRows.map((r) => [String(r.unit_id), num(r.fuel_cents)]));

        const driverIds = [
          ...new Set(
            (baseRes.rows as UnitSqlRow[])
              .map((r) => r.primary_driver_id)
              .filter(Boolean)
              .map(String)
          ),
        ];
        const namesMap = new Map<string, string>();
        if (driverIds.length > 0) {
          const dn = await client.query(
            `
              SELECT id::text AS id, NULLIF(trim(CONCAT_WS(' ', first_name, last_name)), '') AS full_name
              FROM mdata.drivers
              WHERE id = ANY($1::uuid[])
            `,
            [driverIds]
          );
          for (const row of dn.rows as Array<{ id: string; full_name: string | null }>) {
            namesMap.set(row.id, row.full_name ?? row.id);
          }
        }

        const by_truck: TruckAggRow[] = (baseRes.rows as UnitSqlRow[]).map((row) => {
          const unitId = String(row.unit_id);
          const revenue = num(row.revenue_cents);
          const driverPay = num(row.driver_pay_cents);
          const maintenance = num(row.maintenance_cents);
          const fuel = fuelMap.get(unitId) ?? 0;
          const depreciation = 0;
          const other = 0;
          const miles = num(row.miles_driven);
          const loadCount = Math.floor(num(row.load_count));
          const net = revenue - driverPay - fuel - maintenance - depreciation - other;
          const marginPct = revenue > 0 ? (net / revenue) * 100 : 0;
          const rpm = miles > 0 ? revenue / miles : 0;
          const totalCost = driverPay + fuel + maintenance + depreciation + other;
          const cpm = miles > 0 ? totalCost / miles : 0;
          const ppm = miles > 0 ? net / miles : 0;
          const primaryId = row.primary_driver_id ? String(row.primary_driver_id) : null;

          return {
            unit_id: unitId,
            unit_number: String(row.unit_number ?? ""),
            truck_type: String(row.truck_type ?? "unknown"),
            revenue_cents: revenue,
            driver_pay_cents: driverPay,
            fuel_cents: fuel,
            maintenance_cents: maintenance,
            depreciation_cents: depreciation,
            other_cents: other,
            net_profit_cents: net,
            margin_pct: Math.round(marginPct * 100) / 100,
            load_count: loadCount,
            miles_driven: miles,
            revenue_per_mile_cents: Math.round(rpm),
            cost_per_mile_cents: Math.round(cpm),
            profit_per_mile_cents: Math.round(ppm),
            primary_driver_id: primaryId,
            primary_driver_name: primaryId ? namesMap.get(primaryId) ?? null : null,
            flags: [] as TruckFlag[],
          };
        });

        by_truck.sort((a: TruckAggRow, b: TruckAggRow) => b.net_profit_cents - a.net_profit_cents);

        if (by_truck.length > 0) {
          by_truck[0].flags.push("most_profitable");
          const eligible = by_truck.filter((t: TruckAggRow) => t.load_count > 0);
          const loser = eligible.length > 0 ? eligible[eligible.length - 1] : by_truck[by_truck.length - 1];
          if (loser && loser.unit_id !== by_truck[0].unit_id) loser.flags.push("least_profitable");
        }

        for (const row of by_truck) {
          if (row.revenue_cents > 0 && row.maintenance_cents / row.revenue_cents >= 0.3) {
            row.flags.push("high_maintenance");
          }
          if (row.load_count <= 1 && row.revenue_cents > 0 && row.miles_driven < 500) {
            row.flags.push("underutilized");
          }
        }

        const totals = by_truck.reduce(
          (
            acc: {
              revenue_cents: number;
              driver_pay_cents: number;
              fuel_cost_cents: number;
              maintenance_cost_cents: number;
              depreciation_cents: number;
              other_direct_cost_cents: number;
              net_profit_cents: number;
              truck_count: number;
            },
            row: TruckAggRow
          ) => {
            acc.revenue_cents += row.revenue_cents;
            acc.driver_pay_cents += row.driver_pay_cents;
            acc.fuel_cost_cents += row.fuel_cents;
            acc.maintenance_cost_cents += row.maintenance_cents;
            acc.depreciation_cents += row.depreciation_cents;
            acc.other_direct_cost_cents += row.other_cents;
            acc.net_profit_cents += row.net_profit_cents;
            acc.truck_count += 1;
            return acc;
          },
          {
            revenue_cents: 0,
            driver_pay_cents: 0,
            fuel_cost_cents: 0,
            maintenance_cost_cents: 0,
            depreciation_cents: 0,
            other_direct_cost_cents: 0,
            net_profit_cents: 0,
            truck_count: 0,
          }
        );

        const body: ProfitPerTruckExtended = {
          period: { start: pStart, end: pEnd },
          totals,
          by_truck,
          basis,
        };

        return body;
      });

      extendedCache.set(cacheKey, payload, 60_000);
      return payload;
    }

    const legacy = legacyQuerySchema.safeParse(q);
    if (!legacy.success) {
      return validationError(reply, legacy.error);
    }

    const { start, end } = parseMonthWindow(legacy.data.month);

    const rows = await withCompanyScope(user.uuid, legacy.data.operating_company_id, async (client) => {
      const values: unknown[] = [legacy.data.operating_company_id, start, end];
      let unitFilter = "";
      if (legacy.data.unit_id) {
        values.push(legacy.data.unit_id);
        unitFilter = ` AND u.id = $${values.length}`;
      }
      const res = await client.query(
        `
          SELECT
            u.id AS unit_id,
            u.unit_number,
            COALESCE(SUM(CASE WHEN l.created_at >= $2::timestamptz AND l.created_at < $3::timestamptz THEN l.rate_total_cents ELSE 0 END), 0)::bigint AS revenue_cents,
            COALESCE(
              SUM(
                CASE
                  WHEN COALESCE(wo.updated_at, wo.opened_at) >= $2::timestamptz
                   AND COALESCE(wo.updated_at, wo.opened_at) < $3::timestamptz
                  THEN ROUND(COALESCE(wo.total_actual_cost, 0)::numeric * 100)::bigint
                  ELSE 0
                END
              ),
              0
            )::bigint AS wo_cost_cents
          FROM mdata.units u
          LEFT JOIN mdata.loads l
            ON l.assigned_unit_id = u.id
            AND l.operating_company_id = $1
            AND l.soft_deleted_at IS NULL
          LEFT JOIN maintenance.work_orders wo
            ON wo.unit_id = u.id
            AND wo.operating_company_id = $1
          WHERE u.deactivated_at IS NULL
            AND EXISTS (
              SELECT 1
              FROM mdata.loads l_scope
              WHERE l_scope.assigned_unit_id = u.id
                AND l_scope.operating_company_id = $1
                AND l_scope.soft_deleted_at IS NULL
            )
            ${unitFilter}
          GROUP BY u.id, u.unit_number
          ORDER BY (
            COALESCE(SUM(CASE WHEN l.created_at >= $2::timestamptz AND l.created_at < $3::timestamptz THEN l.rate_total_cents ELSE 0 END), 0)
            -
            COALESCE(
              SUM(
                CASE
                  WHEN COALESCE(wo.updated_at, wo.opened_at) >= $2::timestamptz
                   AND COALESCE(wo.updated_at, wo.opened_at) < $3::timestamptz
                  THEN ROUND(COALESCE(wo.total_actual_cost, 0)::numeric * 100)::bigint
                  ELSE 0
                END
              ),
              0
            )
          ) DESC
        `,
        values
      );
      return res.rows.map((row: any) => ({
        unit_id: row.unit_id,
        unit_number: row.unit_number,
        revenue_cents: Number(row.revenue_cents ?? 0),
        wo_cost_cents: Number(row.wo_cost_cents ?? 0),
        profit_cents: Number(row.revenue_cents ?? 0) - Number(row.wo_cost_cents ?? 0),
      }));
    });

    return {
      month: legacy.data.month,
      notes:
        "v1 = revenue minus work-order costs only. Pass period_start & period_end for full truck profitability (P6-T11197).",
      rows,
    };
  });
}
