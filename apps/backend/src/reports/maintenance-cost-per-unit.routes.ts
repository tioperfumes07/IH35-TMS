import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";
import { createTtlCache } from "../lib/ttl-cache.js";
import {
  companyQuerySchema,
  currentAuthUser,
  parseMonthWindow,
  validationError,
  withCompanyScope,
} from "./shared.js";

const periodQuerySchema = companyQuerySchema.extend({
  period_start: z.string().date(),
  period_end: z.string().date(),
});

const legacyMonthSchema = companyQuerySchema.extend({
  period: z.string().regex(/^\d{4}-\d{2}$/),
});

const cache = createTtlCache<unknown>();

export type MaintCostFlag = "high_cost" | "low_cost" | "inspection_due" | "reliable";

export function computeMaintenanceUnitFlags(input: {
  totalCents: number;
  woCount: number;
  p75: number;
  p25: number;
  median: number;
  miles: number;
  inspectionDue: boolean;
}): MaintCostFlag[] {
  const flags: MaintCostFlag[] = [];
  if (input.inspectionDue) flags.push("inspection_due");
  if (input.woCount <= 0) return flags;
  if (input.p75 > 0 && input.totalCents >= input.p75) flags.push("high_cost");
  if (input.p25 > 0 && input.totalCents > 0 && input.totalCents <= input.p25) flags.push("low_cost");
  if (input.woCount >= 3 && input.totalCents <= input.median && input.median > 0 && input.miles >= 500) flags.push("reliable");
  return flags;
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  if (next === undefined) return sorted[base] ?? 0;
  return sorted[base]! + rest * (next - sorted[base]!);
}

function mapWoTypeToCategory(woType: string): string {
  const t = woType.trim().toLowerCase();
  if (t === "tire") return "tire";
  if (t === "pm") return "preventive";
  if (t === "repair") return "repair";
  if (t === "accident") return "accident";
  return t.length > 0 ? t : "other";
}

type UnitAggRow = {
  unit_id: string;
  unit_number: string;
  wo_count: string;
  parts_cents: string;
  labor_cents: string;
  outsourced_cents: string;
  total_cents: string;
  max_single_wo_cents: string;
};

type CategoryAggRow = {
  category: string | null;
  cents: string;
};

type MilesRow = { unit_id: string; miles: string };
type InspectionRow = { unit_id: string; inspection_day: string | null };

type MaintTruckRow = {
  unit_id: string;
  unit_number: string;
  wo_count: number;
  parts_cents: number;
  labor_cents: number;
  outsourced_cents: number;
  total_cents: number;
  miles_driven: number;
  cost_per_mile_cents: number | null;
  avg_wo_cents: number;
  max_single_wo_cents: number;
  flags: MaintCostFlag[];
};

export async function registerMaintenanceCostPerUnitRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/maintenance-cost-per-unit", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const raw = req.query ?? {};
    const parsedPeriod = periodQuerySchema.safeParse(raw);
    const parsedLegacy = legacyMonthSchema.safeParse(raw);

    let operatingCompanyId: string;
    let startDay: string;
    let endDay: string;

    if (parsedPeriod.success) {
      operatingCompanyId = parsedPeriod.data.operating_company_id;
      startDay = parsedPeriod.data.period_start;
      endDay = parsedPeriod.data.period_end;
    } else if (parsedLegacy.success) {
      operatingCompanyId = parsedLegacy.data.operating_company_id;
      const window = parseMonthWindow(parsedLegacy.data.period);
      const startDayUtc = window.start.slice(0, 10);
      const endExclusiveMs = new Date(window.end).getTime();
      const endInclusive = new Date(endExclusiveMs - 86_400_000).toISOString().slice(0, 10);
      startDay = startDayUtc;
      endDay = endInclusive;
    } else {
      return validationError(reply, new z.ZodError([...parsedPeriod.error.issues, ...parsedLegacy.error.issues]));
    }

    if (startDay > endDay) {
      return reply.code(400).send({ error: "validation_error", details: { period: ["period_start must be on or before period_end"] } });
    }

    const cacheKey = `${operatingCompanyId}:${startDay}:${endDay}`;
    const hit = cache.get(cacheKey);
    if (hit) return hit;

    const payload = await withCompanyScope(user.uuid, operatingCompanyId, async (client: PoolClient) => {
      const unitAgg = await client.query<UnitAggRow>(
        `
          WITH wo_scope AS (
            SELECT wo.*
            FROM maintenance.work_orders wo
            WHERE wo.operating_company_id = $1
              AND wo.unit_id IS NOT NULL
              AND COALESCE(wo.updated_at, wo.opened_at)::date BETWEEN $2::date AND $3::date
          ),
          line_totals AS (
            SELECT
              wl.work_order_uuid,
              SUM(CASE WHEN wl.line_type IN ('part', 'parts') THEN ROUND(wl.total_cost::numeric * 100) ELSE 0 END)::bigint AS parts_cents,
              SUM(CASE WHEN wl.line_type = 'labor' THEN ROUND(wl.total_cost::numeric * 100) ELSE 0 END)::bigint AS labor_cents,
              SUM(CASE WHEN wl.line_type NOT IN ('part', 'parts', 'labor') THEN ROUND(wl.total_cost::numeric * 100) ELSE 0 END)::bigint AS other_cents
            FROM maintenance.work_order_lines wl
            INNER JOIN wo_scope wo ON wo.id = wl.work_order_uuid
            GROUP BY wl.work_order_uuid
          ),
          wo_enriched AS (
            SELECT
              wo.unit_id,
              wo.id AS wo_id,
              wo.wo_type::text AS wo_type,
              ROUND(COALESCE(wo.total_actual_cost, 0)::numeric * 100)::bigint AS grand_cents,
              COALESCE(lt.parts_cents, 0) AS parts_cents,
              COALESCE(lt.labor_cents, 0) AS labor_cents,
              COALESCE(lt.other_cents, 0) AS other_cents
            FROM wo_scope wo
            LEFT JOIN line_totals lt ON lt.work_order_uuid = wo.id
          )
          SELECT
            u.id::text AS unit_id,
            u.unit_number::text AS unit_number,
            COUNT(*)::int AS wo_count,
            COALESCE(SUM(we.parts_cents), 0)::text AS parts_cents,
            COALESCE(SUM(we.labor_cents), 0)::text AS labor_cents,
            0::text AS outsourced_cents,
            COALESCE(SUM(we.grand_cents), 0)::text AS total_cents,
            COALESCE(MAX(we.grand_cents), 0)::text AS max_single_wo_cents
          FROM wo_enriched we
          JOIN mdata.units u ON u.id = we.unit_id
          WHERE u.deactivated_at IS NULL
          GROUP BY u.id, u.unit_number
          ORDER BY SUM(we.grand_cents) DESC
        `,
        [operatingCompanyId, startDay, endDay]
      );

      const categoryAgg = await client.query<CategoryAggRow>(
        `
          WITH wo_scope AS (
            SELECT wo.*
            FROM maintenance.work_orders wo
            WHERE wo.operating_company_id = $1
              AND wo.unit_id IS NOT NULL
              AND COALESCE(wo.updated_at, wo.opened_at)::date BETWEEN $2::date AND $3::date
          ),
          wo_enriched AS (
            SELECT
              ROUND(COALESCE(wo.total_actual_cost, 0)::numeric * 100)::bigint AS grand_cents,
              wo.wo_type::text AS wo_type
            FROM wo_scope wo
          )
          SELECT
            COALESCE(we.wo_type, 'unknown') AS category,
            COALESCE(SUM(we.grand_cents), 0)::text AS cents
          FROM wo_enriched we
          GROUP BY COALESCE(we.wo_type, 'unknown')
        `,
        [operatingCompanyId, startDay, endDay]
      );

      const milesRows = await client.query<MilesRow>(
        `
          SELECT
            l.assigned_unit_id::text AS unit_id,
            COALESCE(SUM(COALESCE(l.miles_practical, l.miles_shortest, 0)), 0)::text AS miles
          FROM mdata.loads l
          WHERE l.operating_company_id = $1
            AND l.soft_deleted_at IS NULL
            AND l.assigned_unit_id IS NOT NULL
            AND l.created_at::date BETWEEN $2::date AND $3::date
          GROUP BY l.assigned_unit_id
        `,
        [operatingCompanyId, startDay, endDay]
      );

      const inspectionRows = await client.query<InspectionRow>(
        `
          SELECT DISTINCT ON (unit_id)
            unit_id::text AS unit_id,
            inspection_date::date::text AS inspection_day
          FROM safety.dot_inspections
          WHERE operating_company_id = $1
            AND unit_id IS NOT NULL
          ORDER BY unit_id, inspection_date DESC NULLS LAST
        `,
        [operatingCompanyId]
      );

      const milesByUnit = new Map<string, number>();
      for (const row of milesRows.rows) milesByUnit.set(row.unit_id, num(row.miles));

      const lastInspectionByUnit = new Map<string, string>();
      for (const row of inspectionRows.rows) {
        if (row.inspection_day) lastInspectionByUnit.set(row.unit_id, row.inspection_day);
      }

      const periodEnd = new Date(`${endDay}T00:00:00.000Z`);
      const totalsList = unitAgg.rows.map((r: UnitAggRow) => num(r.total_cents)).filter((v: number) => v > 0);
      const sortedTotals = [...totalsList].sort((a, b) => a - b);
      const p25 = quantile(sortedTotals, 0.25);
      const median = quantile(sortedTotals, 0.5);
      const p75 = quantile(sortedTotals, 0.75);

      let woCountTotal = 0;
      let partsTotal = 0;
      let laborTotal = 0;
      let outsourcedTotal = 0;
      let grandTotal = 0;

      const byCategory: Record<string, number> = {};
      for (const row of categoryAgg.rows) {
        const key = mapWoTypeToCategory(String(row.category ?? "other"));
        const cents = num(row.cents);
        byCategory[key] = (byCategory[key] ?? 0) + cents;
      }

      const byTruck: MaintTruckRow[] = unitAgg.rows.map((row: UnitAggRow) => {
        const wo_count = Number(row.wo_count ?? 0);
        const parts_cents = num(row.parts_cents);
        const labor_cents = num(row.labor_cents);
        const outsourced_cents = num(row.outsourced_cents);
        const total_cents = num(row.total_cents);
        const max_single_wo_cents = num(row.max_single_wo_cents);
        const miles_driven = milesByUnit.get(row.unit_id) ?? 0;
        const cost_per_mile_cents = miles_driven > 0 ? Math.round(total_cents / miles_driven) : null;
        const avg_wo_cents = wo_count > 0 ? Math.round(total_cents / wo_count) : 0;

        woCountTotal += wo_count;
        partsTotal += parts_cents;
        laborTotal += labor_cents;
        outsourcedTotal += outsourced_cents;
        grandTotal += total_cents;

        const lastInspection = lastInspectionByUnit.get(row.unit_id);
        let inspectionDue = false;
        if (lastInspection) {
          const last = new Date(`${lastInspection}T00:00:00.000Z`);
          inspectionDue = (periodEnd.getTime() - last.getTime()) / 86400000 > 395;
        }

        const flags = computeMaintenanceUnitFlags({
          totalCents: total_cents,
          woCount: wo_count,
          p75,
          p25,
          median,
          miles: miles_driven,
          inspectionDue,
        });

        return {
          unit_id: row.unit_id,
          unit_number: row.unit_number,
          wo_count,
          parts_cents,
          labor_cents,
          outsourced_cents,
          total_cents,
          miles_driven,
          cost_per_mile_cents,
          avg_wo_cents,
          max_single_wo_cents,
          flags,
        };
      });

      const rows = byTruck.map((t: MaintTruckRow) => ({
        unit_number: t.unit_number,
        total_cost_cents: t.total_cents,
        wo_count: t.wo_count,
        avg_cost_per_wo_cents: t.avg_wo_cents,
      }));

      return {
        period: { start: startDay, end: endDay },
        totals: {
          wo_count: woCountTotal,
          total_parts_cents: partsTotal,
          total_labor_cents: laborTotal,
          total_outsourced_cents: outsourcedTotal,
          grand_total_cents: grandTotal,
          truck_count: byTruck.filter((t: MaintTruckRow) => t.wo_count > 0).length,
        },
        by_truck: byTruck,
        by_category: byCategory,
        rows,
      };
    });

    cache.set(cacheKey, payload, 60_000);
    return payload;
  });
}
