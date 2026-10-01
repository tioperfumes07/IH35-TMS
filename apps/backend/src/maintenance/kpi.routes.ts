import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
// FLEET-VISIBILITY-F4583-SAMPLE-DATA-GAP (continued): mdata.units readers feeding a human-facing
// KPI must exclude demo/phantom + is_sample_data fixture rows, same shared definition as the Fleet
// roster/KPI (mdata/fleet-visibility.ts) — otherwise a fixture unit silently inflates operating-hour
// and downtime denominators (MTBF reads artificially healthier than the real fleet).
import { excludeDemoPhantomSql, excludeSampleDataSql } from "../mdata/fleet-visibility.js";
import { computePmCostPerMile } from "./pm-cost-per-mile.service.js";

const kpiQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  period_start: z.string().date(),
  period_end: z.string().date(),
  unit_id: z.string().uuid().optional(),
});
const pmComplianceQuerySchema = kpiQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
const drilldownQuerySchema = kpiQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export type KpiSparkPoint = { day: string; value: number };

export function assertKpiPeriod(start: string, end: string): boolean {
  return start <= end;
}

export function computePmCompliancePct(compliant: number, total: number): number {
  if (total <= 0) return 100;
  return Math.round((compliant / total) * 1000) / 10;
}

/** MTBF in hours: operating hours divided by repair failure count. */
export function computeMtbfHours(operatingHours: number, failureCount: number): number | null {
  if (failureCount <= 0) return null;
  return Math.round((operatingHours / failureCount) * 10) / 10;
}

export function computeCpmCents(totalCostCents: number, totalMiles: number): number | null {
  if (totalMiles <= 0) return null;
  return Math.round(totalCostCents / totalMiles);
}

export function buildDailySparkline(rows: Array<{ day: string; value: string | number }>, startDay: string, endDay: string): KpiSparkPoint[] {
  const byDay = new Map<string, number>();
  for (const row of rows) byDay.set(row.day, Number(row.value ?? 0));
  const out: KpiSparkPoint[] = [];
  const cursor = new Date(`${startDay}T00:00:00.000Z`);
  const end = new Date(`${endDay}T00:00:00.000Z`);
  while (cursor.getTime() <= end.getTime()) {
    const day = cursor.toISOString().slice(0, 10);
    out.push({ day, value: byDay.get(day) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    return fn(client);
  });
}

// CLS-LATCH-TABLE-ABSENT-SILENT-DEGRADE: every caller below that short-circuits on `!relationExists(...)`
// must fold an honest `<table>_unavailable: true` into its response instead of returning a bare empty/zero
// payload that is indistinguishable from a genuinely empty, healthy fleet. Do not add a new caller that
// returns a permissive default with no such signal.
async function relationExists(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }, rel: string) {
  const res = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [rel]);
  // false here means the caller must fold an honest `<table>_unavailable: true` into its own
  // response (see the 3 call sites below) rather than returning a bare permissive default.
  return Boolean(res.rows[0]?.ok);
}

type KpiQuery = z.infer<typeof kpiQuerySchema>;

function unitFilter(unitId: string | undefined, alias: string) {
  return unitId ? ` AND ${alias}.unit_id = $4::uuid` : "";
}

function unitParams(unitId: string | undefined) {
  return unitId ? [unitId] : [];
}

export async function registerMaintenanceKpiRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/kpi/summary", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = kpiQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const { operating_company_id: companyId, period_start: startDay, period_end: endDay, unit_id: unitId } = parsed.data;
    if (!assertKpiPeriod(startDay, endDay)) {
      return reply.code(400).send({ error: "validation_error", details: { period: ["period_start must be on or before period_end"] } });
    }

    const payload = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await relationExists(client, "maintenance.work_orders"))) {
        // CLS-LATCH-TABLE-ABSENT-SILENT-DEGRADE: an empty/100%-compliant payload with no signal
        // looks identical to "this fleet genuinely has zero downtime and perfect PM compliance" --
        // the same class of bug fuel.loves_prices_daily already fixed by adding an honest
        // unavailable marker instead of a fabricated value. work_orders_unavailable is additive
        // (existing zeroed fields are unchanged) so no consumer that ignores it regresses.
        return {
          period: { start: startDay, end: endDay },
          unit_id: unitId ?? null,
          downtime_hours: 0,
          mtbf_hours: null,
          cpm_cents: null,
          cost_per_truck_cents: 0,
          pm_compliance_pct: 100,
          sparklines: { downtime: [], mtbf: [], cpm: [], cost_per_truck: [], pm_compliance: [] },
          work_orders_unavailable: true,
        };
      }

      const unitClause = unitFilter(unitId, "wo");
      const baseParams = [companyId, startDay, endDay, ...unitParams(unitId)];

      const downtimeRes = await client.query(
        `
          SELECT COALESCE(SUM(COALESCE(wo.duration_seconds, 0)), 0)::numeric / 3600.0 AS wo_downtime_hours
          FROM maintenance.work_orders wo
          WHERE wo.operating_company_id = $1::uuid
            AND COALESCE(wo.closed_at, wo.opened_at, wo.created_at)::date BETWEEN $2::date AND $3::date
            ${unitClause}
        `,
        baseParams
      );
      const oosRes = await client.query(
        `
          SELECT COALESCE(SUM(
            GREATEST(
              0,
              EXTRACT(EPOCH FROM (
                LEAST(now(), ($3::date + INTERVAL '1 day')::timestamptz)
                - GREATEST(u.oos_since, $2::date)
              )) / 3600.0
            )
          ), 0)::numeric AS oos_hours
          FROM mdata.units u
          WHERE (u.owner_company_id = $1::uuid OR u.currently_leased_to_company_id = $1::uuid)
            AND u.is_oos = true
            AND u.oos_since IS NOT NULL
            AND u.oos_since::date <= $3::date
            AND ${excludeDemoPhantomSql("u.unit_number")}
            AND ${excludeSampleDataSql("u.is_sample_data")}
            ${unitId ? " AND u.id = $4::uuid" : ""}
        `,
        unitId ? [companyId, startDay, endDay, unitId] : [companyId, startDay, endDay]
      );
      const downtime_hours =
        Number(downtimeRes.rows[0]?.wo_downtime_hours ?? 0) + Number(oosRes.rows[0]?.oos_hours ?? 0);

      const repairRes = await client.query(
        `
          SELECT COUNT(*)::int AS failure_count
          FROM maintenance.work_orders wo
          WHERE wo.operating_company_id = $1::uuid
            AND wo.wo_type = 'repair'
            AND wo.status IN ('complete', 'completed')
            AND COALESCE(wo.closed_at, wo.updated_at)::date BETWEEN $2::date AND $3::date
            ${unitClause}
        `,
        baseParams
      );
      const failureCount = Number(repairRes.rows[0]?.failure_count ?? 0);
      const periodDays = Math.max(1, Math.round((new Date(`${endDay}T00:00:00Z`).getTime() - new Date(`${startDay}T00:00:00Z`).getTime()) / 86400000) + 1);
      const operatingHours = periodDays * 24 * (unitId ? 1 : Math.max(1, await countActiveUnits(client, companyId)));
      const mtbf_hours = computeMtbfHours(operatingHours, failureCount);

      const costRes = await client.query(
        `
          SELECT
            COALESCE(SUM(ROUND(COALESCE(wo.total_actual_cost, 0)::numeric * 100)), 0)::bigint AS total_cents,
            COUNT(DISTINCT wo.unit_id) FILTER (WHERE wo.unit_id IS NOT NULL)::int AS truck_count
          FROM maintenance.work_orders wo
          WHERE wo.operating_company_id = $1::uuid
            AND COALESCE(wo.closed_at, wo.opened_at, wo.updated_at)::date BETWEEN $2::date AND $3::date
            ${unitClause}
        `,
        baseParams
      );
      const totalCostCents = Number(costRes.rows[0]?.total_cents ?? 0);
      const truckCount = Math.max(1, Number(costRes.rows[0]?.truck_count ?? 0));
      const cost_per_truck_cents = Math.round(totalCostCents / truckCount);

      // E-15 (Owner Law 2026-10-01): CPM divides by REAL DRIVEN miles from the one E-15 engine -- never practical
      // or short miles (this tile used COALESCE(miles_practical, miles_shortest) by load created_at before).
      const e15 = await computePmCostPerMile(client as never, companyId, startDay, endDay, unitId ?? undefined);
      const realCpm = (e15.fleet as { maintenance_cpm?: Array<{ cents_per_mile: number | null; reason: string | null; units_included: number; units_excluded: number }> }).maintenance_cpm?.[0];
      const cpm_cents = realCpm?.cents_per_mile != null ? Math.round(realCpm.cents_per_mile) : null;
      const cpm_basis = "real_driven" as const;
      const cpm_reason = realCpm?.reason ?? null;

      const pmRes = await client.query(
        `
          SELECT
            COUNT(*)::int AS total_schedules,
            COUNT(*) FILTER (
              WHERE NOT EXISTS (
                SELECT 1 FROM maintenance.pm_alerts pa
                WHERE pa.pm_schedule_id = ps.id
                  AND pa.operating_company_id = ps.operating_company_id
                  AND pa.state IN ('open', 'acknowledged')
              )
            )::int AS compliant_schedules
          FROM maintenance.pm_schedules ps
          WHERE ps.operating_company_id = $1::uuid
            AND ps.is_active = true
            ${unitId ? " AND ps.unit_id = $2::uuid" : ""}
        `,
        unitId ? [companyId, unitId] : [companyId]
      );
      const pmTotal = Number(pmRes.rows[0]?.total_schedules ?? 0);
      const pmCompliant = Number(pmRes.rows[0]?.compliant_schedules ?? 0);
      const pm_compliance_pct = computePmCompliancePct(pmCompliant, pmTotal);

      const downtimeSpark = buildDailySparkline(
        (
          await client.query(
            `
              SELECT COALESCE(wo.closed_at, wo.opened_at, wo.created_at)::date::text AS day,
                     COALESCE(SUM(COALESCE(wo.duration_seconds, 0)), 0)::numeric / 3600.0 AS value
              FROM maintenance.work_orders wo
              WHERE wo.operating_company_id = $1::uuid
                AND COALESCE(wo.closed_at, wo.opened_at, wo.created_at)::date BETWEEN $2::date AND $3::date
                ${unitClause}
              GROUP BY 1
              ORDER BY 1
            `,
            baseParams
          )
        ).rows as Array<{ day: string; value: string | number }>,
        startDay,
        endDay
      );

      const costSpark = buildDailySparkline(
        (
          await client.query(
            `
              SELECT COALESCE(wo.closed_at, wo.opened_at, wo.created_at)::date::text AS day,
                     COALESCE(SUM(ROUND(COALESCE(wo.total_actual_cost, 0)::numeric * 100)), 0)::numeric AS value
              FROM maintenance.work_orders wo
              WHERE wo.operating_company_id = $1::uuid
                AND COALESCE(wo.closed_at, wo.opened_at, wo.updated_at)::date BETWEEN $2::date AND $3::date
                ${unitClause}
              GROUP BY 1
              ORDER BY 1
            `,
            baseParams
          )
        ).rows as Array<{ day: string; value: string | number }>,
        startDay,
        endDay
      );

      return {
        period: { start: startDay, end: endDay },
        unit_id: unitId ?? null,
        downtime_hours: Math.round(downtime_hours * 10) / 10,
        mtbf_hours,
        cpm_cents,
        cpm_basis,
        cpm_reason,
        cost_per_truck_cents,
        pm_compliance_pct,
        sparklines: {
          downtime: downtimeSpark,
          mtbf: downtimeSpark,
          cpm: costSpark,
          cost_per_truck: costSpark,
          pm_compliance: downtimeSpark.map((p) => ({ ...p, value: pm_compliance_pct })),
        },
      };
    });

    return payload;
  });

  app.get("/api/v1/maintenance/kpi/downtime", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    return kpiDrilldown(req, reply, "downtime");
  });

  app.get("/api/v1/maintenance/kpi/mtbf", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    return kpiDrilldown(req, reply, "mtbf");
  });

  app.get("/api/v1/maintenance/kpi/cpm", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    return kpiDrilldown(req, reply, "cpm");
  });

  app.get("/api/v1/maintenance/kpi/cost-per-truck", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    return kpiDrilldown(req, reply, "cost_per_truck");
  });

  app.get("/api/v1/maintenance/kpi/pm-compliance", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = pmComplianceQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const { operating_company_id: companyId, unit_id: unitId, limit, offset } = parsed.data;

    const payload = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await relationExists(client, "maintenance.pm_schedules"))) return { rows: [], total_count: 0, pm_schedules_unavailable: true };
      const params: unknown[] = [companyId];
      if (unitId) params.push(unitId);
      params.push(limit, offset);
      const limitParam = params.length - 1;
      const offsetParam = params.length;
      const res = await client.query(
        `
          SELECT
            ps.id::text AS schedule_id,
            ps.label AS schedule_label,
            u.unit_number,
            ps.unit_id::text,
            CASE
              WHEN EXISTS (
                SELECT 1 FROM maintenance.pm_alerts pa
                WHERE pa.pm_schedule_id = ps.id
                  AND pa.operating_company_id = ps.operating_company_id
                  AND pa.state IN ('open', 'acknowledged')
              ) THEN 'non_compliant'
              ELSE 'compliant'
            END AS compliance_status,
            ps.next_due_odometer
          FROM maintenance.pm_schedules ps
          -- CLS-JOIN-ENTITY-UNSCOPED (§4: units carry owner/leased, never operating_company_id)
          JOIN mdata.units u ON u.id = ps.unit_id
                             AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = ps.operating_company_id
          WHERE ps.operating_company_id = $1::uuid
            AND ps.is_active = true
            ${unitId ? " AND ps.unit_id = $2::uuid" : ""}
          ORDER BY compliance_status DESC, u.unit_number ASC
          LIMIT $${limitParam}
          OFFSET $${offsetParam}
        `,
        params
      );
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS total_count
           FROM maintenance.pm_schedules ps
           JOIN mdata.units u ON u.id = ps.unit_id
                              AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = ps.operating_company_id
          WHERE ps.operating_company_id = $1::uuid
            AND ps.is_active = true
            ${unitId ? " AND ps.unit_id = $2::uuid" : ""}`,
        unitId ? [companyId, unitId] : [companyId]
      );
      return { rows: res.rows, total_count: Number(countRes.rows[0]?.total_count ?? 0) };
    });

    return { ...payload, hub_links: { pm_auto_engine: "/maintenance/pm-auto-engine", pm_schedule: "/maintenance/pm-schedule" } };
  });

  // ROUND 285.4.9 / #33 — idle events with NULL idle_source need human review (confirm → 'manual').
  app.get("/api/v1/maintenance/idle-events/needs-review", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = z
      .object({ operating_company_id: z.string().uuid(), limit: z.coerce.number().int().min(1).max(200).default(100) })
      .safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const { operating_company_id: companyId, limit } = parsed.data;
    const payload = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await relationExists(client, "downtime.events"))) {
        return { rows: [], total_count: 0, downtime_events_unavailable: true };
      }
      const res = await client.query(
        `
          SELECT e.id::text AS event_id,
                 u.unit_number,
                 e.unit_id::text,
                 cat.label AS category,
                 fp.label AS fault,
                 e.started_at::text AS started_at,
                 e.ended_at::text AS ended_at,
                 e.engine_on_idle_hours::float8 AS engine_on_idle_hours,
                 e.idle_source,
                 NULLIF(TRIM(BOTH ', ' FROM COALESCE(e.location_city, '') || ', ' || COALESCE(e.location_state, '')), '') AS location
            FROM downtime.events e
            LEFT JOIN mdata.units u ON u.id = e.unit_id
            LEFT JOIN catalogs.downtime_categories cat ON cat.id = e.category_id
            LEFT JOIN catalogs.downtime_fault_parties fp ON fp.id = e.fault_party_id
           WHERE e.operating_company_id = $1::uuid
             AND e.is_sample_data IS NOT TRUE
             AND e.idle_source IS NULL
           ORDER BY e.started_at DESC NULLS LAST
           LIMIT $2
        `,
        [companyId, limit]
      );
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS n FROM downtime.events
          WHERE operating_company_id = $1::uuid AND is_sample_data IS NOT TRUE AND idle_source IS NULL`,
        [companyId]
      );
      return { rows: res.rows, total_count: Number(countRes.rows[0]?.n ?? 0) };
    });
    return payload;
  });

  app.post("/api/v1/maintenance/idle-events/:id/confirm-manual", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    const body = z
      .object({ operating_company_id: z.string().uuid() })
      .safeParse(req.body ?? {});
    if (!params.success) return validationError(reply, params.error);
    if (!body.success) return validationError(reply, body.error);
    const companyId = body.data.operating_company_id;
    const result = await withCompany(user.uuid, companyId, async (client) => {
      const upd = await client.query(
        `
          UPDATE downtime.events
             SET idle_source = 'manual',
                 updated_at = now()
           WHERE id = $1::uuid
             AND operating_company_id = $2::uuid
             AND is_sample_data IS NOT TRUE
             AND idle_source IS NULL
       RETURNING id::text AS event_id, idle_source
        `,
        [params.data.id, companyId]
      );
      return upd.rows[0] ?? null;
    });
    if (!result) return reply.code(404).send({ error: "idle_event_not_found_or_already_sourced" });
    return { ok: true, ...result };
  });
}

async function countActiveUnits(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }, companyId: string) {
  const res = await client.query(
    `SELECT COUNT(*)::int AS c
       FROM mdata.units
      WHERE (owner_company_id = $1::uuid OR currently_leased_to_company_id = $1::uuid)
        AND deactivated_at IS NULL
        AND ${excludeDemoPhantomSql("unit_number")}
        AND ${excludeSampleDataSql()}`,
    [companyId]
  );
  return Number(res.rows[0]?.c ?? 1);
}

async function kpiDrilldown(req: FastifyRequest, reply: FastifyReply, kind: "downtime" | "mtbf" | "cpm" | "cost_per_truck") {
  const user = authed(req, reply);
  if (!user) return;
  const parsed = drilldownQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) return validationError(reply, parsed.error);
  const q = parsed.data;
  if (!assertKpiPeriod(q.period_start, q.period_end)) {
    return reply.code(400).send({ error: "validation_error", details: { period: ["period_start must be on or before period_end"] } });
  }

  const payload = await withCompany(user.uuid, q.operating_company_id, async (client) => {
    if (!(await relationExists(client, "maintenance.work_orders"))) return { rows: [], total_count: 0, work_orders_unavailable: true };
    const unitClause = unitFilter(q.unit_id, "wo");
    const params: unknown[] = [q.operating_company_id, q.period_start, q.period_end, ...unitParams(q.unit_id)];
    let dataSql: string;
    let orderSql: string;

    if (kind === "cpm") {
      // E-15: one engine for cost per mile -- real driven miles, cost from WO -> bills/expenses, basis on every row.
      const e15 = await computePmCostPerMile(client as never, q.operating_company_id, q.period_start, q.period_end, q.unit_id ?? undefined);
      const all = e15.units
        .map((u) => ({
          unit_id: u.unit_id,
          unit_number: u.unit_number,
          total_cents: u.maintenance_cost_cents,
          miles: u.real_driven_miles,
          miles_basis: "real_driven",
          miles_reason: u.real_driven_reason,
          cost_per_mile_cents: u.maintenance_cpm[0]?.cents_per_mile != null ? Math.round(u.maintenance_cpm[0].cents_per_mile) : null,
          cost_per_mile_reason: u.maintenance_cpm[0]?.reason ?? null,
          practical_miles: u.practical_miles,
          short_miles: u.short_miles,
        }))
        .sort((a, b) => b.total_cents - a.total_cents || a.unit_id.localeCompare(b.unit_id));
      return { rows: all.slice(q.offset, q.offset + q.limit), total_count: all.length };
    }
    if (kind === "downtime") {
      dataSql = `
          SELECT
            wo.id::text,
            wo.display_id,
            u.unit_number,
            COALESCE(wo.duration_seconds, 0)::numeric / 3600.0 AS downtime_hours,
            wo.status::text,
            COALESCE(wo.closed_at, wo.opened_at)::text AS event_at
          FROM maintenance.work_orders wo
          -- CLS-JOIN-ENTITY-UNSCOPED (§4: units carry owner/leased, never operating_company_id)
          JOIN mdata.units u ON u.id = wo.unit_id
                             AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = wo.operating_company_id
          WHERE wo.operating_company_id = $1::uuid
            AND COALESCE(wo.closed_at, wo.opened_at, wo.created_at)::date BETWEEN $2::date AND $3::date
            AND COALESCE(wo.duration_seconds, 0) > 0
            ${unitClause}
        `;
      orderSql = "downtime_hours DESC, id ASC";
    } else if (kind === "mtbf") {
      dataSql = `
          SELECT
            u.unit_number,
            wo.unit_id::text,
            COUNT(*)::int AS repair_count,
            COALESCE(AVG(wo.duration_seconds), 0)::numeric / 3600.0 AS avg_repair_hours
          FROM maintenance.work_orders wo
          -- CLS-JOIN-ENTITY-UNSCOPED (§4: units carry owner/leased, never operating_company_id)
          JOIN mdata.units u ON u.id = wo.unit_id
                             AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = wo.operating_company_id
          WHERE wo.operating_company_id = $1::uuid
            AND wo.wo_type = 'repair'
            AND wo.status IN ('complete', 'completed')
            AND COALESCE(wo.closed_at, wo.updated_at)::date BETWEEN $2::date AND $3::date
            ${unitClause}
          GROUP BY u.unit_number, wo.unit_id
        `;
      orderSql = "repair_count DESC, unit_id ASC";
    } else {
      dataSql = `
        SELECT
          u.unit_number,
          wo.unit_id::text,
          COUNT(*)::int AS wo_count,
          COALESCE(SUM(ROUND(COALESCE(wo.total_actual_cost, 0)::numeric * 100)), 0)::bigint AS total_cents
        FROM maintenance.work_orders wo
        -- CLS-JOIN-ENTITY-UNSCOPED (§4: units carry owner/leased, never operating_company_id)
        JOIN mdata.units u ON u.id = wo.unit_id
                           AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = wo.operating_company_id
        WHERE wo.operating_company_id = $1::uuid
          AND COALESCE(wo.closed_at, wo.opened_at, wo.updated_at)::date BETWEEN $2::date AND $3::date
          ${unitClause}
        GROUP BY u.unit_number, wo.unit_id
      `;
      orderSql = "total_cents DESC, unit_id ASC";
    }

    params.push(q.limit, q.offset);
    const limitParam = params.length - 1;
    const offsetParam = params.length;
    const res = await client.query(
      `WITH data AS (${dataSql}),
            totals AS (SELECT COUNT(*)::int AS total_count FROM data)
       SELECT page.*, totals.total_count
         FROM totals
         LEFT JOIN LATERAL (
           SELECT * FROM data
            ORDER BY ${orderSql}
            LIMIT $${limitParam} OFFSET $${offsetParam}
         ) page ON TRUE`,
      params
    );
    const totalCount = Number(res.rows[0]?.total_count ?? 0);
    const rows = res.rows
      .filter((row) => row.id != null || row.unit_id != null)
      .map(({ total_count: _totalCount, ...row }) => row);
    return { rows, total_count: totalCount };
  });

  return { kind, ...payload, report_cross_link: "/reports/maintenance-cost-per-unit" };
}
