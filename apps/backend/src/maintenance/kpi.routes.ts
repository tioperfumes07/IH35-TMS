import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const kpiQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  period_start: z.string().date(),
  period_end: z.string().date(),
  unit_id: z.string().uuid().optional(),
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
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
    return fn(client);
  });
}

async function relationExists(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }, rel: string) {
  const res = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [rel]);
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
  app.get("/api/v1/maintenance/kpi/summary", async (req, reply) => {
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
        return {
          period: { start: startDay, end: endDay },
          unit_id: unitId ?? null,
          downtime_hours: 0,
          mtbf_hours: null,
          cpm_cents: null,
          cost_per_truck_cents: 0,
          pm_compliance_pct: 100,
          sparklines: { downtime: [], mtbf: [], cpm: [], cost_per_truck: [], pm_compliance: [] },
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
          WHERE u.owner_company_id = $1::uuid
            AND u.is_oos = true
            AND u.oos_since IS NOT NULL
            AND u.oos_since::date <= $3::date
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

      const milesRes = await client.query(
        `
          SELECT COALESCE(SUM(COALESCE(l.miles_practical, l.miles_shortest, 0)), 0)::numeric AS miles
          FROM mdata.loads l
          WHERE l.operating_company_id = $1::uuid
            AND l.soft_deleted_at IS NULL
            AND l.created_at::date BETWEEN $2::date AND $3::date
            ${unitId ? " AND l.assigned_unit_id = $4::uuid" : ""}
        `,
        baseParams
      );
      const totalMiles = Number(milesRes.rows[0]?.miles ?? 0);
      const cpm_cents = computeCpmCents(totalCostCents, totalMiles);

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

  app.get("/api/v1/maintenance/kpi/downtime", async (req, reply) => {
    return kpiDrilldown(req, reply, "downtime");
  });

  app.get("/api/v1/maintenance/kpi/mtbf", async (req, reply) => {
    return kpiDrilldown(req, reply, "mtbf");
  });

  app.get("/api/v1/maintenance/kpi/cpm", async (req, reply) => {
    return kpiDrilldown(req, reply, "cpm");
  });

  app.get("/api/v1/maintenance/kpi/cost-per-truck", async (req, reply) => {
    return kpiDrilldown(req, reply, "cost_per_truck");
  });

  app.get("/api/v1/maintenance/kpi/pm-compliance", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = kpiQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const { operating_company_id: companyId, unit_id: unitId } = parsed.data;

    const rows = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await relationExists(client, "maintenance.pm_schedules"))) return [];
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
          JOIN mdata.units u ON u.id = ps.unit_id
          WHERE ps.operating_company_id = $1::uuid
            AND ps.is_active = true
            ${unitId ? " AND ps.unit_id = $2::uuid" : ""}
          ORDER BY compliance_status DESC, u.unit_number ASC
          LIMIT 200
        `,
        unitId ? [companyId, unitId] : [companyId]
      );
      return res.rows;
    });

    return { rows, hub_links: { pm_auto_engine: "/maintenance/pm-auto-engine", pm_schedule: "/maintenance/pm-schedule" } };
  });
}

async function countActiveUnits(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }, companyId: string) {
  const res = await client.query(
    `SELECT COUNT(*)::int AS c FROM mdata.units WHERE owner_company_id = $1::uuid AND deactivated_at IS NULL`,
    [companyId]
  );
  return Number(res.rows[0]?.c ?? 1);
}

async function kpiDrilldown(req: FastifyRequest, reply: FastifyReply, kind: "downtime" | "mtbf" | "cpm" | "cost_per_truck") {
  const user = authed(req, reply);
  if (!user) return;
  const parsed = kpiQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) return validationError(reply, parsed.error);
  const q: KpiQuery = parsed.data;
  if (!assertKpiPeriod(q.period_start, q.period_end)) {
    return reply.code(400).send({ error: "validation_error", details: { period: ["period_start must be on or before period_end"] } });
  }

  const rows = await withCompany(user.uuid, q.operating_company_id, async (client) => {
    if (!(await relationExists(client, "maintenance.work_orders"))) return [];
    const unitClause = unitFilter(q.unit_id, "wo");
    const params = [q.operating_company_id, q.period_start, q.period_end, ...unitParams(q.unit_id)];

    if (kind === "downtime") {
      const res = await client.query(
        `
          SELECT
            wo.id::text,
            wo.display_id,
            u.unit_number,
            COALESCE(wo.duration_seconds, 0)::numeric / 3600.0 AS downtime_hours,
            wo.status::text,
            COALESCE(wo.closed_at, wo.opened_at)::text AS event_at
          FROM maintenance.work_orders wo
          JOIN mdata.units u ON u.id = wo.unit_id
          WHERE wo.operating_company_id = $1::uuid
            AND COALESCE(wo.closed_at, wo.opened_at, wo.created_at)::date BETWEEN $2::date AND $3::date
            AND COALESCE(wo.duration_seconds, 0) > 0
            ${unitClause}
          ORDER BY downtime_hours DESC
          LIMIT 100
        `,
        params
      );
      return res.rows;
    }

    if (kind === "mtbf") {
      const res = await client.query(
        `
          SELECT
            u.unit_number,
            wo.unit_id::text,
            COUNT(*)::int AS repair_count,
            COALESCE(AVG(wo.duration_seconds), 0)::numeric / 3600.0 AS avg_repair_hours
          FROM maintenance.work_orders wo
          JOIN mdata.units u ON u.id = wo.unit_id
          WHERE wo.operating_company_id = $1::uuid
            AND wo.wo_type = 'repair'
            AND wo.status IN ('complete', 'completed')
            AND COALESCE(wo.closed_at, wo.updated_at)::date BETWEEN $2::date AND $3::date
            ${unitClause}
          GROUP BY u.unit_number, wo.unit_id
          ORDER BY repair_count DESC
          LIMIT 100
        `,
        params
      );
      return res.rows;
    }

    if (kind === "cpm") {
      const res = await client.query(
        `
          WITH wo_cost AS (
            SELECT
              wo.unit_id,
              COALESCE(SUM(ROUND(COALESCE(wo.total_actual_cost, 0)::numeric * 100)), 0)::bigint AS total_cents
            FROM maintenance.work_orders wo
            WHERE wo.operating_company_id = $1::uuid
              AND COALESCE(wo.closed_at, wo.opened_at, wo.updated_at)::date BETWEEN $2::date AND $3::date
              ${unitClause}
            GROUP BY wo.unit_id
          ),
          unit_miles AS (
            SELECT
              l.assigned_unit_id AS unit_id,
              COALESCE(SUM(COALESCE(l.miles_practical, l.miles_shortest, 0)), 0)::numeric AS miles
            FROM mdata.loads l
            WHERE l.operating_company_id = $1::uuid
              AND l.soft_deleted_at IS NULL
              AND l.created_at::date BETWEEN $2::date AND $3::date
              ${q.unit_id ? " AND l.assigned_unit_id = $4::uuid" : ""}
            GROUP BY l.assigned_unit_id
          )
          SELECT
            u.unit_number,
            wc.unit_id::text,
            wc.total_cents,
            COALESCE(um.miles, 0)::numeric AS miles,
            CASE WHEN COALESCE(um.miles, 0) > 0 THEN ROUND(wc.total_cents / um.miles)::int ELSE NULL END AS cost_per_mile_cents
          FROM wo_cost wc
          JOIN mdata.units u ON u.id = wc.unit_id
          LEFT JOIN unit_miles um ON um.unit_id = wc.unit_id
          ORDER BY wc.total_cents DESC
          LIMIT 100
        `,
        params
      );
      return res.rows;
    }

    const res = await client.query(
      `
        SELECT
          u.unit_number,
          wo.unit_id::text,
          COUNT(*)::int AS wo_count,
          COALESCE(SUM(ROUND(COALESCE(wo.total_actual_cost, 0)::numeric * 100)), 0)::bigint AS total_cents
        FROM maintenance.work_orders wo
        JOIN mdata.units u ON u.id = wo.unit_id
        WHERE wo.operating_company_id = $1::uuid
          AND COALESCE(wo.closed_at, wo.opened_at, wo.updated_at)::date BETWEEN $2::date AND $3::date
          ${unitClause}
        GROUP BY u.unit_number, wo.unit_id
        ORDER BY total_cents DESC
        LIMIT 100
      `,
      params
    );
    return res.rows;
  });

  return { kind, rows, report_cross_link: "/reports/maintenance-cost-per-unit" };
}
