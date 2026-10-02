/**
 * ORDER-2026-09-04 part B -- THREE-MILE COST PER MILE: per load, unit, driver, lane and fleet, each CPM divided
 * by a NAMED mileage basis:
 *   practical   = mdata.loads.miles_practical (billed to the customer)
 *   short       = miles_shortest + miles_deadhead (paid to the driver)
 *   real_driven = odometer: the load's real loaded legs + its real deadhead leg (telematics/load-real-driven-
 *                 miles.service.ts). NULL with the reason when either is not measured -- never practical/short.
 * Direct cost per load comes ONLY from the canonical per-load cost read model (accounting/load-cost-rollup.sql.ts:
 * fuel + other expenses + bill lines + driver pay) -- no cost math here. A group's CPM = the summed cost of the
 * loads that HAVE that basis / their summed miles (never cost of all loads over miles of some), with the
 * included/excluded load counts stated. MPG = miles / diesel gallons (fuel.fuel_transactions, not voided) on the
 * practical and real bases.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { loadCostRollupLateral } from "../accounting/load-cost-rollup.sql.js";
import { MILEAGE_BASES, type MileageBasis } from "../maintenance/pm-cost-per-mile.service.js";
import { computeLoadRealDrivenMiles } from "../telematics/load-real-driven-miles.service.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export const THREE_MILE_GROUPS = ["load", "unit", "driver", "lane"] as const;
export type ThreeMileGroup = (typeof THREE_MILE_GROUPS)[number];

export type ThreeMileLoad = {
  load_id: string;
  load_number: string | null;
  unit_id: string | null;
  unit_number: string | null;
  driver_id: string | null;
  driver_name: string | null;
  lane: string | null;
  delivered_at: string;
  direct_cost_cents: number;
  diesel_gallons: number | null;
  miles: Record<MileageBasis, number | null>;
  miles_reason: Record<MileageBasis, string | null>;
};

export type BasisFigure = {
  basis: MileageBasis;
  basis_label: string;
  miles: number | null;
  cost_cents: number;
  cents_per_mile: number | null;
  loads_included: number;
  loads_excluded: number;
  reason: string | null;
};
export type MpgFigure = { basis: "practical" | "real_driven"; basis_label: string; miles: number | null; gallons: number | null; mpg: number | null; reason: string | null };

export type ThreeMileGroupRow = {
  key: string;
  label: string;
  group: ThreeMileGroup | "fleet";
  ref_id: string | null;
  loads: number;
  direct_cost_cents: number;
  cpm: BasisFigure[];
  mpg: MpgFigure[];
  real_minus_practical_miles: number | null;
  real_minus_short_miles: number | null;
};

const BASES: MileageBasis[] = ["real_driven", "practical", "short"];
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Pure: one basis over a set of loads -- cost and miles of ONLY the loads that have that basis. */
export function basisFigure(loads: ThreeMileLoad[], basis: MileageBasis): BasisFigure {
  const with_ = loads.filter((l) => l.miles[basis] != null && (l.miles[basis] as number) > 0);
  const miles = with_.reduce((s, l) => s + (l.miles[basis] as number), 0);
  const cost = with_.reduce((s, l) => s + l.direct_cost_cents, 0);
  const excluded = loads.length - with_.length;
  const firstReason = loads.find((l) => l.miles[basis] == null)?.miles_reason[basis] ?? null;
  return {
    basis,
    basis_label: MILEAGE_BASES[basis],
    miles: with_.length ? r1(miles) : null,
    cost_cents: cost,
    cents_per_mile: with_.length && miles > 0 ? Math.round((cost / miles) * 100) / 100 : null,
    loads_included: with_.length,
    loads_excluded: excluded,
    reason: with_.length ? null : `no load in this group has ${MILEAGE_BASES[basis]}${firstReason ? ` (e.g. ${firstReason})` : ""}`,
  };
}

/** Pure: MPG on one basis -- miles and gallons of ONLY the loads that have both. */
export function mpgFigure(loads: ThreeMileLoad[], basis: "practical" | "real_driven"): MpgFigure {
  const with_ = loads.filter((l) => l.miles[basis] != null && l.diesel_gallons != null && l.diesel_gallons > 0);
  const miles = with_.reduce((s, l) => s + (l.miles[basis] as number), 0);
  const gallons = with_.reduce((s, l) => s + (l.diesel_gallons as number), 0);
  return {
    basis,
    basis_label: MILEAGE_BASES[basis],
    miles: with_.length ? r1(miles) : null,
    gallons: with_.length ? r1(gallons) : null,
    mpg: with_.length && gallons > 0 ? Math.round((miles / gallons) * 1000) / 1000 : null,
    reason: with_.length ? null : `no load in this group has both ${MILEAGE_BASES[basis]} and diesel gallons`,
  };
}

/** Pure: driven-but-unbilled / unpaid miles over loads that have both bases. */
function diff(loads: ThreeMileLoad[], other: "practical" | "short"): number | null {
  const both = loads.filter((l) => l.miles.real_driven != null && l.miles[other] != null);
  if (!both.length) return null;
  return r1(both.reduce((s, l) => s + (l.miles.real_driven as number) - (l.miles[other] as number), 0));
}

export function groupRow(group: ThreeMileGroup | "fleet", key: string, label: string, refId: string | null, loads: ThreeMileLoad[]): ThreeMileGroupRow {
  return {
    key,
    label,
    group,
    ref_id: refId,
    loads: loads.length,
    direct_cost_cents: loads.reduce((s, l) => s + l.direct_cost_cents, 0),
    cpm: BASES.map((b) => basisFigure(loads, b)),
    mpg: [mpgFigure(loads, "real_driven"), mpgFigure(loads, "practical")],
    real_minus_practical_miles: diff(loads, "practical"),
    real_minus_short_miles: diff(loads, "short"),
  };
}

/** Pure: group loads. */
export function groupLoads(loads: ThreeMileLoad[], group: ThreeMileGroup): ThreeMileGroupRow[] {
  if (group === "load") return loads.map((l) => groupRow("load", l.load_id, l.load_number ?? l.load_id, l.load_id, [l]));
  const keyOf = (l: ThreeMileLoad): [string, string, string | null] =>
    group === "unit"
      ? [l.unit_id ?? "none", l.unit_number ?? "No truck", l.unit_id]
      : group === "driver"
        ? [l.driver_id ?? "none", l.driver_name ?? "No driver", l.driver_id]
        : [l.lane ?? "none", l.lane ?? "No lane (stops without city)", null];
  const by = new Map<string, { label: string; ref: string | null; loads: ThreeMileLoad[] }>();
  for (const l of loads) {
    const [k, label, ref] = keyOf(l);
    const g = by.get(k) ?? { label, ref, loads: [] };
    g.loads.push(l);
    by.set(k, g);
  }
  return [...by.entries()].map(([k, g]) => groupRow(group, k, g.label, g.ref, g.loads)).sort((a, b) => a.label.localeCompare(b.label));
}

export async function loadThreeMileLoads(client: DbClient, operatingCompanyId: string, from: string, to: string): Promise<ThreeMileLoad[]> {
  // Loads delivered in [from 00:00, to + 1 day 00:00) America/Chicago -- the actual arrival at the last delivery stop.
  const base = await client.query<{
    load_id: string; load_number: string | null; unit_id: string | null; unit_number: string | null; driver_id: string | null; driver_name: string | null;
    lane: string | null; delivered_at: string; practical: string | null; shortest: string | null; deadhead: string | null;
    costs_cents: string | null; driver_pay_cents: string | null; diesel_gallons: string | null;
  }>(
    `WITH d AS (
       SELECT l.id, l.operating_company_id, l.assigned_unit_id, l.miles_practical, l.miles_shortest, l.miles_deadhead,
              (SELECT s.actual_arrival_at FROM mdata.load_stops s
                WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL AND s.stop_type = 'delivery' AND s.actual_arrival_at IS NOT NULL
                ORDER BY s.sequence_number DESC LIMIT 1) AS delivered_at,
              (SELECT NULLIF(upper(btrim(concat_ws(', ', NULLIF(btrim(s.city), ''), NULLIF(btrim(s.state), '')))), '') FROM mdata.load_stops s
                WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL AND s.stop_type = 'pickup' ORDER BY s.sequence_number ASC LIMIT 1) AS lane_from,
              (SELECT NULLIF(upper(btrim(concat_ws(', ', NULLIF(btrim(s.city), ''), NULLIF(btrim(s.state), '')))), '') FROM mdata.load_stops s
                WHERE s.load_id = l.id AND s.soft_deleted_at IS NULL AND s.stop_type = 'delivery' ORDER BY s.sequence_number DESC LIMIT 1) AS lane_to
         FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.voided_at IS NULL AND l.canceled_at IS NULL)
     SELECT l.id::text AS load_id, lcr.load_number, l.assigned_unit_id::text AS unit_id, lcr.unit_number,
            lcr.driver_id, lcr.driver_name,
            CASE WHEN d.lane_from IS NOT NULL AND d.lane_to IS NOT NULL THEN d.lane_from || ' → ' || d.lane_to END AS lane,
            d.delivered_at::text AS delivered_at,
            d.miles_practical::text AS practical, d.miles_shortest::text AS shortest, d.miles_deadhead::text AS deadhead,
            lcr.costs_cents::text, lcr.driver_pay_cents::text,
            (SELECT sum(ft.gallons) FROM fuel.fuel_transactions ft
              WHERE ft.load_id = l.id AND ft.operating_company_id = l.operating_company_id
                AND ft.voided_at IS NULL AND ft.fuel_type = 'diesel')::text AS diesel_gallons
       FROM d
       JOIN mdata.loads l ON l.id = d.id
       ${loadCostRollupLateral("l.id", "l.operating_company_id")}
      WHERE d.delivered_at >= ($2::date)::timestamp AT TIME ZONE 'America/Chicago'
        AND d.delivered_at < (($3::date) + 1)::timestamp AT TIME ZONE 'America/Chicago'
      ORDER BY d.delivered_at, l.id`,
    [operatingCompanyId, from, to]
  );
  if (!base.rows.length) return [];
  const real = new Map((await computeLoadRealDrivenMiles(client, operatingCompanyId, base.rows.map((r) => r.load_id))).map((x) => [x.load_id, x]));
  const num = (x: string | null) => (x == null ? null : Number(x));
  return base.rows.map((r) => {
    const rd = real.get(r.load_id);
    const dh = rd?.legs.find((l) => l.kind === "deadhead");
    const realTotal = rd?.miles_driven_actual != null && dh?.miles != null ? r1(rd.miles_driven_actual + dh.miles) : null;
    const realReason =
      realTotal != null ? null : rd?.miles_driven_actual == null ? (rd?.reason ?? "not measured") : `deadhead leg: ${dh?.reason ?? "not measured"}`;
    const practical = num(r.practical);
    const shortest = num(r.shortest);
    return {
      load_id: r.load_id,
      load_number: r.load_number,
      unit_id: r.unit_id,
      unit_number: r.unit_number,
      driver_id: r.driver_id,
      driver_name: r.driver_name,
      lane: r.lane,
      delivered_at: r.delivered_at,
      direct_cost_cents: Number(r.costs_cents ?? 0) + Number(r.driver_pay_cents ?? 0),
      diesel_gallons: num(r.diesel_gallons),
      miles: { real_driven: realTotal, practical, short: shortest != null ? r1(shortest + (num(r.deadhead) ?? 0)) : null },
      miles_reason: {
        real_driven: realReason,
        practical: practical == null ? "load has no practical miles" : null,
        short: shortest == null ? "load has no shortest miles" : null,
      },
    };
  });
}

export async function computeThreeMileCpm(client: DbClient, operatingCompanyId: string, from: string, to: string, group: ThreeMileGroup) {
  const loads = await loadThreeMileLoads(client, operatingCompanyId, from, to);
  return {
    period: { from, to, timezone: "America/Chicago" as const },
    group,
    mileage_bases: MILEAGE_BASES,
    cost_source: "accounting/load-cost-rollup (fuel + other expenses + bill lines + driver pay)",
    rows: groupLoads(loads, group),
    fleet: groupRow("fleet", "fleet", "Fleet", null, loads),
  };
}

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  group_by: z.enum(THREE_MILE_GROUPS).default("unit"),
});

export async function registerThreeMileCpmRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/three-mile-cpm", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return reply;
    const user = req.user;
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    if (parsed.data.from > parsed.data.to) return reply.code(400).send({ error: "from_after_to" });
    await assertCompanyMembership(user.uuid, parsed.data.operating_company_id);
    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [parsed.data.operating_company_id]);
      return computeThreeMileCpm(client as DbClient, parsed.data.operating_company_id, parsed.data.from, parsed.data.to, parsed.data.group_by);
    });
  });
}
