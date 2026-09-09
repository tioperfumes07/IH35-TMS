import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { splitCostByMiles, sharesReconcile, type UnitMiles, type UnitCostShare } from "./load-unit-cost-split.math.js";

/**
 * SET-28 — vehicle-swap mid-trip cost split by miles each truck ran.
 *
 *   GET /api/v1/accounting/loads/:loadId/unit-cost-split?operating_company_id=…
 *
 * A load is normally pulled by one truck (mdata.loads.assigned_unit_id). When it is swapped
 * mid-trip, dispatch.load_assignment_history records each (previous_unit_id → new_unit_id, assigned_at).
 * This route reports, per truck that ran the load, the miles it ran and the miles-weighted share of
 * the load's operating-cost pool (expenses + bills — the SAME pool the Load-Costs board sums; driver
 * pay follows the driver, not the truck, so it is NOT split here). Single truck → one row, 100%.
 *
 * Miles basis, most-trusted first:
 *   1. "telematics" — SUM(driven_miles) per unit from telematics.load_odometer_segments.
 *   2. "time_window" — practical miles apportioned by how long each truck was the assigned unit
 *      (from the assignment-history timeline), when telematics has captured nothing yet.
 *   3. "equal" — last resort when neither miles nor a usable timeline exist; splits evenly so the
 *      cents still reconcile, and the surface says so.
 *
 * Read-only. Cents reconcile exactly (asserted below and by the guard).
 */

const loadParams = z.object({ loadId: z.string().uuid() });

type Db = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type LoadUnitCostSplit = {
  load_id: string;
  load_number: string | null;
  is_multi_unit: boolean;
  miles_basis: "telematics" | "time_window" | "equal";
  pool_cents: number;
  total_miles: number;
  reconciled: boolean;
  units: UnitCostShare[];
};

const numOr0 = (v: unknown) => (v == null ? 0 : Number(v));

export async function buildLoadUnitCostSplit(
  client: Db,
  companyId: string,
  loadId: string
): Promise<LoadUnitCostSplit | null> {
  // 1) The load itself + the cost pool (same expressions as loadCostRollupLateral).
  const loadRes = await client.query<{
    load_number: string | null;
    assigned_unit_id: string | null;
    miles_practical: unknown;
    load_start: string | null;
    load_end: string | null;
    pool_cents: unknown;
  }>(
    `SELECT l.load_number,
            l.assigned_unit_id::text,
            l.miles_practical,
            COALESCE(
              (SELECT MIN(COALESCE(s.actual_arrival_at, s.scheduled_arrival_at)) FROM mdata.load_stops s
                WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL),
              l.created_at
            )::text AS load_start,
            COALESCE(
              (SELECT MAX(COALESCE(s.actual_departure_at, s.actual_arrival_at, s.scheduled_arrival_at)) FROM mdata.load_stops s
                WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL),
              now()
            )::text AS load_end,
            (
              COALESCE((SELECT SUM(e.total_amount_cents) FROM accounting.expenses e
                         WHERE e.load_id = l.id AND e.operating_company_id = l.operating_company_id AND e.status <> 'void'), 0)
              + COALESCE((SELECT SUM(ROUND(bl.amount * 100)) FROM accounting.bill_lines bl
                           JOIN accounting.bills b ON b.id = bl.bill_id
                          WHERE bl.load_id = l.id AND b.operating_company_id = l.operating_company_id
                            AND b.status NOT IN ('void','voided') AND b.revoked_at IS NULL AND bl.voided_at IS NULL), 0)
            )::bigint AS pool_cents
       FROM mdata.loads l
      WHERE l.id = $1::uuid AND l.operating_company_id = $2::uuid AND l.soft_deleted_at IS NULL
      LIMIT 1`,
    [loadId, companyId]
  );
  const load = loadRes.rows[0];
  if (!load) return null;

  // 2) The units that ran the load: distinct of prior + new unit across the swap history, plus the
  //    current assigned unit. Ordered by first appearance so the surface reads chronologically.
  const unitRes = await client.query<{ unit_id: string; unit_number: string | null; first_at: string | null }>(
    `WITH events AS (
       SELECT previous_unit_id AS unit_id, assigned_at FROM dispatch.load_assignment_history
         WHERE load_id = $1::uuid AND operating_company_id = $2::uuid AND previous_unit_id IS NOT NULL
       UNION ALL
       SELECT new_unit_id, assigned_at FROM dispatch.load_assignment_history
         WHERE load_id = $1::uuid AND operating_company_id = $2::uuid AND new_unit_id IS NOT NULL
       UNION ALL
       SELECT assigned_unit_id, NULL::timestamptz FROM mdata.loads
         WHERE id = $1::uuid AND operating_company_id = $2::uuid AND assigned_unit_id IS NOT NULL
     )
     SELECT e.unit_id::text, u.unit_number, MIN(e.assigned_at)::text AS first_at
       FROM events e
       LEFT JOIN mdata.units u ON u.id = e.unit_id
      GROUP BY e.unit_id, u.unit_number
      ORDER BY MIN(e.assigned_at) ASC NULLS FIRST`,
    [loadId, companyId]
  );
  const runningUnits = unitRes.rows;
  if (runningUnits.length === 0) {
    // No unit ever assigned — nothing to split. Honest empty (never fabricate a truck).
    return {
      load_id: loadId, load_number: load.load_number, is_multi_unit: false,
      miles_basis: "equal", pool_cents: numOr0(load.pool_cents), total_miles: 0, reconciled: true, units: [],
    };
  }

  // 3a) Real telematics miles per running unit.
  const unitIds = runningUnits.map((u) => u.unit_id);
  const odoRes = await client.query<{ unit_id: string; miles: unknown }>(
    `SELECT seg.unit_id::text, COALESCE(SUM(seg.driven_miles), 0) AS miles
       FROM telematics.load_odometer_segments seg
      WHERE seg.load_id = $1::uuid AND seg.operating_company_id = $2::uuid AND seg.unit_id = ANY($3::uuid[])
      GROUP BY seg.unit_id`,
    [loadId, companyId, unitIds]
  );
  const realMiles = new Map<string, number>();
  for (const r of odoRes.rows) realMiles.set(r.unit_id, numOr0(r.miles));
  const totalRealMiles = [...realMiles.values()].reduce((s, m) => s + m, 0);

  // 3b) Time-window basis (fallback): apportion practical miles by how long each truck was the
  //     assigned unit across the swap timeline.
  const practical = numOr0(load.miles_practical);
  const timeWindowMiles = computeTimeWindowMiles(
    runningUnits.map((u) => ({ unit_id: u.unit_id, first_at: u.first_at })),
    load.load_end,
    practical
  );
  const totalTimeWindowMiles = [...timeWindowMiles.values()].reduce((s, m) => s + m, 0);

  let miles_basis: LoadUnitCostSplit["miles_basis"];
  let unitMiles: UnitMiles[];
  if (totalRealMiles > 0) {
    miles_basis = "telematics";
    unitMiles = runningUnits.map((u) => ({ unit_id: u.unit_id, unit_number: u.unit_number, miles: realMiles.get(u.unit_id) ?? 0 }));
  } else if (totalTimeWindowMiles > 0) {
    miles_basis = "time_window";
    unitMiles = runningUnits.map((u) => ({ unit_id: u.unit_id, unit_number: u.unit_number, miles: timeWindowMiles.get(u.unit_id) ?? 0 }));
  } else {
    miles_basis = "equal";
    unitMiles = runningUnits.map((u) => ({ unit_id: u.unit_id, unit_number: u.unit_number, miles: 0 }));
  }

  const pool = numOr0(load.pool_cents);
  const shares = splitCostByMiles(pool, unitMiles);
  const totalMiles = unitMiles.reduce((s, u) => s + u.miles, 0);

  return {
    load_id: loadId,
    load_number: load.load_number,
    is_multi_unit: runningUnits.length > 1,
    miles_basis,
    pool_cents: pool,
    total_miles: Math.round(totalMiles * 10) / 10,
    reconciled: sharesReconcile(pool, shares),
    units: shares,
  };
}

/** Apportion practical miles by the duration each unit was the assigned truck. The ordered units
 *  (by first_at) form consecutive windows; the last window runs to load_end. Units with no timestamp
 *  (e.g. only the current assigned unit, no swap) get the whole window. Pure, no DB. */
export function computeTimeWindowMiles(
  units: { unit_id: string; first_at: string | null }[],
  loadEnd: string | null,
  practicalMiles: number
): Map<string, number> {
  const out = new Map<string, number>();
  if (units.length === 0 || !(practicalMiles > 0)) return out;
  if (units.length === 1) {
    out.set(units[0].unit_id, practicalMiles);
    return out;
  }
  const end = loadEnd ? Date.parse(loadEnd) : NaN;
  const starts = units.map((u) => (u.first_at ? Date.parse(u.first_at) : NaN));
  // If any window is unusable (no timestamps), fall back to equal so the caller still gets numbers.
  const usable = starts.every((s) => Number.isFinite(s)) && Number.isFinite(end);
  if (!usable) {
    for (const u of units) out.set(u.unit_id, practicalMiles / units.length);
    return out;
  }
  const durations = units.map((u, i) => {
    const next = i + 1 < units.length ? starts[i + 1] : end;
    return Math.max(0, next - starts[i]);
  });
  const totalDur = durations.reduce((s, d) => s + d, 0);
  if (totalDur <= 0) {
    for (const u of units) out.set(u.unit_id, practicalMiles / units.length);
    return out;
  }
  units.forEach((u, i) => out.set(u.unit_id, (practicalMiles * durations[i]) / totalDur));
  return out;
}

export async function registerLoadUnitCostSplitRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/accounting/loads/:loadId/unit-cost-split",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const p = loadParams.safeParse(req.params ?? {});
      if (!p.success) return validationError(reply, p.error);
      const q = companyQuerySchema.safeParse(req.query ?? {});
      if (!q.success) return validationError(reply, q.error);
      const out = await withCompanyScope(user.uuid, q.data.operating_company_id, (client) =>
        buildLoadUnitCostSplit(client as unknown as Db, q.data.operating_company_id, p.data.loadId)
      );
      if (!out) return reply.code(404).send({ error: "load_not_found" });
      return out;
    }
  );
}

export default fp(async (app) => {
  await registerLoadUnitCostSplitRoutes(app);
}, { name: "accounting.registerLoadUnitCostSplitRoutes" });
