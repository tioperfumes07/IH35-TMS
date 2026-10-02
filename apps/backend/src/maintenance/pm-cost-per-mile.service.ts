/**
 * E-15 addition -- PM COST PER MILE (Owner Law 2026-10-01: money pause lifted; ORDER-2026-09-04 three-mile CPM).
 *
 * Per unit and per period, plus the fleet:
 *   REAL DRIVEN miles  -- the odometer is cumulative, so miles = reading at the period END minus reading at the
 *                         period START. Each boundary is anchored on the nearest REAL reading (telematics
 *                         .vehicle_locations.odometer_mi, or the telematics.odometer_readings measured/entered
 *                         ledger -- the same Samsara stat) by the shared rule in telematics/odometer-anchor.ts
 *                         (pickAnchor); a gap in the middle of the period does not matter. No anchor, or an odometer
 *                         that went backwards, is NULL WITH A REASON -- never zero, never interpolated, never
 *                         borrowed from practical/short miles. Measured 2026-10-01: the odometer feed was dark
 *                         2026-08-26..2026-09-29 for every truck, so September is honestly not measurable.
 *   PRACTICAL miles    -- sum of mdata.loads.miles_practical (billed to the customer) on the unit's loads
 *                         delivered in the period (actual arrival at the last delivery stop).
 *   SHORT miles        -- sum of miles_shortest + miles_deadhead (paid to the driver) on the same loads.
 *   PM / maintenance cost -- maintenance.work_orders -> accounting.bills (linked_work_order_uuid, bill_date in
 *                         period, not voided), split parts / labor / other from the bill lines, plus paid-same-day
 *                         accounting.expenses linked the same way. PM = wo_type 'pm'; maintenance = every wo_type.
 * Every CPM names the mileage it divides by. The real-driven CPM is the true number; practical and short are shown
 * beside it for the comparison, never substituted for it.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { fetchOdometerAnchors, realDrivenMiles, type OdometerAnchor } from "../telematics/odometer-anchor.js";
import { fleetRosterSql } from "../mdata/fleet-visibility.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export const MILEAGE_BASES = {
  real_driven: "real driven -- telematics odometer readings only (never practical or short miles)",
  practical: "practical -- PC*MILER miles billed to the customer (mdata.loads.miles_practical)",
  short: "short -- PC*MILER miles paid to the driver (miles_shortest + miles_deadhead)",
} as const;
export type MileageBasis = keyof typeof MILEAGE_BASES;

export type Cpm = { basis: MileageBasis; basis_label: string; cents_per_mile: number | null; reason: string | null };

export type UnitCpmRow = {
  unit_id: string;
  unit_number: string;
  real_driven_miles: number | null;
  real_driven_reason: string | null;
  odometer_start_anchor: OdometerAnchor | null;
  odometer_end_anchor: OdometerAnchor | null;
  practical_miles: number | null;
  short_miles: number | null;
  loads_in_period: number;
  loads_missing_practical: number;
  loads_missing_short: number;
  pm_cost_cents: number;
  maintenance_cost_cents: number;
  cost_breakdown_cents: { parts: number; labor: number; other: number; expenses: number };
  work_order_ids: string[];
  bill_ids: string[];
  expense_ids: string[];
  pm_cpm: Cpm[];
  maintenance_cpm: Cpm[];
};

/** Pure: cents per mile for one basis, or null with the reason. Never divides by zero or a missing mileage. */
export function cpmFor(costCents: number, miles: number | null, basis: MileageBasis, missingReason: string | null): Cpm {
  const base = { basis, basis_label: MILEAGE_BASES[basis] };
  if (miles == null) return { ...base, cents_per_mile: null, reason: missingReason ?? `no ${basis} miles in the period` };
  if (miles <= 0) return { ...base, cents_per_mile: null, reason: `${basis} miles are 0 in the period -- no per-mile figure` };
  return { ...base, cents_per_mile: Math.round((costCents / miles) * 100) / 100, reason: null };
}

/** A reading this close to the boundary is used even if the truck was moving: the few minutes of miles land in the
 *  adjacent period through the same shared anchor -- shifted, never lost, never counted twice. */
// One definition of "the odometer at a moment", shared with the load/leg real-driven-miles engine.
export { MOVING_ANCHOR_MAX_MINUTES, pickAnchor, realDrivenMiles, type OdometerAnchor } from "../telematics/odometer-anchor.js";

export async function computePmCostPerMile(
  client: DbClient,
  operatingCompanyId: string,
  from: string,
  to: string,
  unitId?: string
): Promise<{ period: { from: string; to: string; timezone: "America/Chicago" }; units: UnitCpmRow[]; fleet: Record<string, unknown> }> {
  // Period = [from 00:00, to + 1 day 00:00) America/Chicago.
  const units = await client.query<{ id: string; unit_number: string }>(
    `SELECT u.id::text, u.unit_number
       FROM mdata.units u
      WHERE ${fleetRosterSql("u", "$1")}
        AND ($2::uuid IS NULL OR u.id = $2::uuid)
      ORDER BY u.unit_number`,
    [operatingCompanyId, unitId ?? null]
  );
  const unitIds = units.rows.map((u) => u.id);
  const empty = { period: { from, to, timezone: "America/Chicago" as const }, units: [] as UnitCpmRow[], fleet: {} };
  if (unitIds.length === 0) return empty;

  // Boundary anchors: [from 00:00 CT] and [min(to + 1 day 00:00 CT, now)], resolved by the shared anchor rule.
  const b = await client.query<{ start_ts: string; end_ts: string }>(
    `SELECT (($1::date)::timestamp AT TIME ZONE 'America/Chicago')::text AS start_ts,
            LEAST((($2::date) + 1)::timestamp AT TIME ZONE 'America/Chicago', now())::text AS end_ts`,
    [from, to]
  );
  const bounds = b.rows[0];
  const anchors = bounds
    ? await fetchOdometerAnchors(client, operatingCompanyId, [
        ...unitIds.map((id) => ({ key: `${id}:start`, unit_id: id, at: new Date(bounds.start_ts).toISOString() })),
        ...unitIds.map((id) => ({ key: `${id}:end`, unit_id: id, at: new Date(bounds.end_ts).toISOString() })),
      ])
    : new Map<string, { anchor: OdometerAnchor | null; reason: string | null }>();

  const loads = await client.query<{ unit_id: string; loads: string; practical: string | null; short: string | null; missing_practical: string; missing_short: string }>(
    `WITH delivered AS (
       SELECT l.id, l.assigned_unit_id, l.miles_practical, l.miles_shortest, l.miles_deadhead,
              (SELECT s.actual_arrival_at FROM mdata.load_stops s
                WHERE s.load_id = l.id AND s.stop_type = 'delivery' AND s.actual_arrival_at IS NOT NULL
                ORDER BY s.sequence_number DESC LIMIT 1) AS delivered_at
         FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid
          AND l.assigned_unit_id = ANY($2::uuid[])
          AND l.voided_at IS NULL
          AND l.canceled_at IS NULL)
     SELECT assigned_unit_id::text AS unit_id, count(*)::text AS loads,
            sum(miles_practical)::text AS practical,
            sum(miles_shortest + COALESCE(miles_deadhead, 0)) FILTER (WHERE miles_shortest IS NOT NULL)::text AS short,
            count(*) FILTER (WHERE miles_practical IS NULL)::text AS missing_practical,
            count(*) FILTER (WHERE miles_shortest IS NULL)::text AS missing_short
       FROM delivered
      WHERE delivered_at >= ($3::date)::timestamp AT TIME ZONE 'America/Chicago'
        AND delivered_at <  (($4::date) + 1)::timestamp AT TIME ZONE 'America/Chicago'
      GROUP BY assigned_unit_id`,
    [operatingCompanyId, unitIds, from, to]
  );

  const bills = await client.query<{ unit_id: string; work_order_id: string; wo_type: string; bill_id: string; amount_cents: string; parts_cents: string; labor_cents: string }>(
    `SELECT w.unit_id::text, w.id::text AS work_order_id, w.wo_type::text, b.id::text AS bill_id, b.amount_cents::text,
            COALESCE((SELECT round(sum(bl.amount) * 100) FROM accounting.bill_lines bl WHERE bl.bill_id = b.id AND bl.voided_at IS NULL AND bl.part_uuid IS NOT NULL), 0)::text AS parts_cents,
            COALESCE((SELECT round(sum(bl.amount) * 100) FROM accounting.bill_lines bl WHERE bl.bill_id = b.id AND bl.voided_at IS NULL AND bl.labor_rate_uuid IS NOT NULL), 0)::text AS labor_cents
       FROM accounting.bills b
       JOIN maintenance.work_orders w ON w.id = b.linked_work_order_uuid AND w.operating_company_id = b.operating_company_id
      WHERE b.operating_company_id = $1::uuid
        AND w.unit_id = ANY($2::uuid[])
        AND b.voided_at IS NULL
        AND w.voided_at IS NULL
        AND b.bill_date BETWEEN $3::date AND $4::date`,
    [operatingCompanyId, unitIds, from, to]
  );

  const expenses = await client.query<{ unit_id: string; work_order_id: string; wo_type: string; expense_id: string; total_amount_cents: string }>(
    `SELECT w.unit_id::text, w.id::text AS work_order_id, w.wo_type::text, e.id::text AS expense_id, e.total_amount_cents::text
       FROM accounting.expenses e
       JOIN maintenance.work_orders w ON w.id = e.linked_work_order_uuid AND w.operating_company_id = e.operating_company_id
      WHERE e.operating_company_id = $1::uuid
        AND w.unit_id = ANY($2::uuid[])
        AND e.voided_at IS NULL
        AND w.voided_at IS NULL
        AND e.transaction_date BETWEEN $3::date AND $4::date`,
    [operatingCompanyId, unitIds, from, to]
  );

  const loadBy = new Map(loads.rows.map((r) => [r.unit_id, r]));
  const rows: UnitCpmRow[] = units.rows.map((u) => {
    const startPick = anchors.get(`${u.id}:start`) ?? { anchor: null as OdometerAnchor | null, reason: "no odometer reading" };
    const endPick = anchors.get(`${u.id}:end`) ?? { anchor: null as OdometerAnchor | null, reason: "no odometer reading" };
    const r0 = realDrivenMiles(startPick.anchor, endPick.anchor, startPick.reason, endPick.reason);
    const real = { miles: r0.miles, reason: r0.reason ? `period ${r0.reason}` : null };
    const l = loadBy.get(u.id);
    const myBills = bills.rows.filter((b) => b.unit_id === u.id);
    const myExp = expenses.rows.filter((e) => e.unit_id === u.id);
    const sum = (xs: Array<{ wo_type: string; c: number }>, pmOnly: boolean) => xs.filter((x) => !pmOnly || x.wo_type === "pm").reduce((a, x) => a + x.c, 0);
    const costItems = [
      ...myBills.map((b) => ({ wo_type: b.wo_type, c: Number(b.amount_cents) })),
      ...myExp.map((e) => ({ wo_type: e.wo_type, c: Number(e.total_amount_cents) })),
    ];
    const pmCost = sum(costItems, true);
    const mCost = sum(costItems, false);
    const parts = myBills.reduce((a, b) => a + Number(b.parts_cents), 0);
    const labor = myBills.reduce((a, b) => a + Number(b.labor_cents), 0);
    const billTotal = myBills.reduce((a, b) => a + Number(b.amount_cents), 0);
    const practical = l?.practical != null ? Number(l.practical) : null;
    const short = l?.short != null ? Number(l.short) : null;
    const cpms = (cost: number) => [
      cpmFor(cost, real.miles, "real_driven", real.reason),
      cpmFor(cost, practical, "practical", Number(l?.loads ?? 0) === 0 ? "no delivered loads in the period" : null),
      cpmFor(cost, short, "short", Number(l?.loads ?? 0) === 0 ? "no delivered loads in the period" : null),
    ];
    return {
      unit_id: u.id,
      unit_number: u.unit_number,
      real_driven_miles: real.miles,
      real_driven_reason: real.reason,
      odometer_start_anchor: startPick.anchor,
      odometer_end_anchor: endPick.anchor,
      practical_miles: practical,
      short_miles: short,
      loads_in_period: Number(l?.loads ?? 0),
      loads_missing_practical: Number(l?.missing_practical ?? 0),
      loads_missing_short: Number(l?.missing_short ?? 0),
      pm_cost_cents: pmCost,
      maintenance_cost_cents: mCost,
      cost_breakdown_cents: { parts, labor, other: billTotal - parts - labor, expenses: myExp.reduce((a, e) => a + Number(e.total_amount_cents), 0) },
      work_order_ids: [...new Set([...myBills.map((b) => b.work_order_id), ...myExp.map((e) => e.work_order_id)])],
      bill_ids: myBills.map((b) => b.bill_id),
      expense_ids: myExp.map((e) => e.expense_id),
      pm_cpm: cpms(pmCost),
      maintenance_cpm: cpms(mCost),
    };
  });

  // Fleet: totals over the units that HAVE each mileage basis -- a unit with no real miles is excluded from the
  // real-driven denominator and its cost from that numerator, and both are counted, never silently dropped.
  const fleetFor = (basis: MileageBasis, milesOf: (r: UnitCpmRow) => number | null, costOf: (r: UnitCpmRow) => number) => {
    const inc = rows.filter((r) => milesOf(r) != null && (milesOf(r) as number) > 0);
    const miles = inc.reduce((a, r) => a + (milesOf(r) as number), 0);
    const cost = inc.reduce((a, r) => a + costOf(r), 0);
    return { ...cpmFor(cost, inc.length ? miles : null, basis, inc.length ? null : `no unit has ${basis} miles in the period`), miles: inc.length ? miles : null, cost_cents: cost, units_included: inc.length, units_excluded: rows.length - inc.length };
  };
  const fleet = {
    units: rows.length,
    pm_cost_cents: rows.reduce((a, r) => a + r.pm_cost_cents, 0),
    maintenance_cost_cents: rows.reduce((a, r) => a + r.maintenance_cost_cents, 0),
    pm_cpm: (["real_driven", "practical", "short"] as const).map((b) =>
      fleetFor(b, (r) => (b === "real_driven" ? r.real_driven_miles : b === "practical" ? r.practical_miles : r.short_miles), (r) => r.pm_cost_cents)
    ),
    maintenance_cpm: (["real_driven", "practical", "short"] as const).map((b) =>
      fleetFor(b, (r) => (b === "real_driven" ? r.real_driven_miles : b === "practical" ? r.practical_miles : r.short_miles), (r) => r.maintenance_cost_cents)
    ),
    // Driven but neither billed nor paid -- the ORDER-2026-09-04 headline gap.
    real_minus_short_miles: (() => {
      const inc = rows.filter((r) => r.real_driven_miles != null && r.short_miles != null);
      return inc.length ? Math.round(inc.reduce((a, r) => a + (r.real_driven_miles as number) - (r.short_miles as number), 0) * 10) / 10 : null;
    })(),
  };
  return { period: { from, to, timezone: "America/Chicago" }, units: rows, fleet };
}

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unit_id: z.string().uuid().optional(),
});

export async function registerPmCostPerMileRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/pm-cost-per-mile", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return reply;
    const user = req.user;
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    if (parsed.data.from > parsed.data.to) return reply.code(400).send({ error: "from_after_to" });
    await assertCompanyMembership(user.uuid, parsed.data.operating_company_id);
    const payload = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [parsed.data.operating_company_id]);
      return computePmCostPerMile(client as DbClient, parsed.data.operating_company_id, parsed.data.from, parsed.data.to, parsed.data.unit_id);
    });
    return { ...payload, mileage_bases: MILEAGE_BASES };
  });
}
