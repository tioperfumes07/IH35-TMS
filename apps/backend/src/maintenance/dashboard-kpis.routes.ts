import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  countOpenMaintenanceWorkOrders,
  countPastDueMaintenanceWorkOrders,
  countPmDueAlerts,
} from "../kpi/canonical-kpis.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: Queryable) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    return fn(client);
  });
}

async function relationExists(client: Queryable, rel: string) {
  const res = await client.query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [rel]);
  return Boolean(res.rows[0]?.ok);
}

async function columnExists(client: Queryable, schema: string, table: string, column: string) {
  const res = await client.query<{ ok: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
          AND column_name = $3
      ) AS ok
    `,
    [schema, table, column]
  );
  return Boolean(res.rows[0]?.ok);
}

const EMPTY_KPI_PAYLOAD = {
  open_wos: 0,
  in_shop: 0,
  past_due_pm: 0,
  out_of_service: 0,
  open_damage: 0,
  avg_wo_age_days: 0,
  mtd_repair_cost: 0,
  mtd_parts_cost: 0,
  avg_wo_cost: 0,
  top_vendor: null,
  top_failure: null,
  pending_qbo: 0,
  past_due: 0,
  avg_close_days: 0,
  open_dollars: 0,
  tire_alerts: 0,
  pm_due: 0,
  dot_oos: 0,
  in_progress: 0,
  waiting_parts: 0,
  severe_oos: 0,
  road_service: 0,
  parts_low_stock: 0,
  total_units: 0,
  active_units: 0,
};

export async function registerMaintenanceDashboardKpisRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/dashboard/kpis", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const companyId = parsed.data.operating_company_id;

    try {
      const payload = await withCompany(user.uuid, companyId, async (client) => {
        if (!(await relationExists(client, "maintenance.work_orders"))) {
          return { ...EMPTY_KPI_PAYLOAD };
        }

        let base: Record<string, unknown> = {};
        if (await relationExists(client, "views.maintenance_dashboard_kpis")) {
          const kpi = await client.query(`SELECT * FROM views.maintenance_dashboard_kpis WHERE operating_company_id = $1 LIMIT 1`, [
            companyId,
          ]);
          base = kpi.rows[0] ?? {};
        }

        let totalUnits = 0;
        let activeUnits = 0;
        let dotOos = 0;
        if (await relationExists(client, "mdata.units")) {
          const hasIsOos = await columnExists(client, "mdata", "units", "is_oos");
          const fleetRes = await client.query<{
            total_units: number;
            active_units: number;
            dot_oos: number;
          }>(
            `
              SELECT
                COUNT(*)::int AS total_units,
                COUNT(*) FILTER (WHERE status = 'InService')::int AS active_units,
                COUNT(*) FILTER (WHERE ${hasIsOos ? "COALESCE(is_oos, false)" : "false"})::int AS dot_oos
              FROM mdata.units
              WHERE owner_company_id = $1::uuid
                AND deactivated_at IS NULL
            `,
            [companyId]
          );
          const fleet = fleetRes.rows[0];
          totalUnits = Number(fleet?.total_units ?? 0);
          activeUnits = Number(fleet?.active_units ?? 0);
          dotOos = Number(fleet?.dot_oos ?? 0);
        }

        const openWoCount = await countOpenMaintenanceWorkOrders(client, companyId);

        let openCost = 0;
        if (await columnExists(client, "maintenance", "work_orders", "total_actual_cost")) {
          const openRes = await client.query<{ open_cost: number }>(
            `
              SELECT COALESCE(SUM(COALESCE(total_actual_cost, 0)), 0)::numeric AS open_cost
              FROM maintenance.work_orders
              WHERE operating_company_id = $1::uuid
                AND status IN ('open', 'in_progress', 'waiting_parts')
            `,
            [companyId]
          );
          openCost = Number(openRes.rows[0]?.open_cost ?? 0);
        }

        let avgCloseDays = 0;
        if (await columnExists(client, "maintenance", "work_orders", "duration_seconds")) {
          const avgCloseRes = await client.query<{ avg_seconds: number }>(
            `
              SELECT COALESCE(AVG(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL), 0)::numeric AS avg_seconds
              FROM maintenance.work_orders
              WHERE operating_company_id = $1::uuid
                AND status IN ('complete', 'completed')
                AND closed_at >= (now() - INTERVAL '30 days')
            `,
            [companyId]
          );
          avgCloseDays = Number(avgCloseRes.rows[0]?.avg_seconds ?? 0) / 86400;
        }

        let tireAlerts = 0;
        if (await columnExists(client, "maintenance", "work_orders", "wo_type")) {
          const tireRes = await client.query<{ tire_alerts: number }>(
            `
              SELECT COUNT(*)::int AS tire_alerts
              FROM maintenance.work_orders
              WHERE operating_company_id = $1::uuid
                AND wo_type = 'tire'
                AND status IN ('open', 'in_progress', 'waiting_parts')
            `,
            [companyId]
          );
          tireAlerts = Number(tireRes.rows[0]?.tire_alerts ?? 0);
        }

        const pmDueCount = (await relationExists(client, "maintenance.pm_alerts"))
          ? await countPmDueAlerts(client, companyId)
          : 0;
        const pastDueCount = await countPastDueMaintenanceWorkOrders(client, companyId);

        // R&M Status Board 2nd stat strip (rm-status-board.html) — real, entity-scoped counts (no migration).
        // In Progress / Awaiting Parts split out of open WOs; Road Service = roadside bucket; Severe/OOS =
        // open severe-repair estimates; Parts Low-Stock = on_hand_qty<=2 (same rule as the parts KPI).
        const woStatus = await client.query<{ in_progress: number; waiting_parts: number; road_service: number }>(
          `
            SELECT
              COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
              COUNT(*) FILTER (WHERE status = 'waiting_parts')::int AS waiting_parts,
              COUNT(*) FILTER (
                WHERE ${(await columnExists(client, "maintenance", "work_orders", "bucket")) ? "bucket = 'roadside'" : "false"}
                  AND status IN ('open', 'in_progress', 'waiting_parts')
              )::int AS road_service
            FROM maintenance.work_orders
            WHERE operating_company_id = $1::uuid
          `,
          [companyId]
        );
        const inProgressCount = Number(woStatus.rows[0]?.in_progress ?? 0);
        const waitingPartsCount = Number(woStatus.rows[0]?.waiting_parts ?? 0);
        const roadServiceCount = Number(woStatus.rows[0]?.road_service ?? 0);

        let severeOosCount = 0;
        if (await relationExists(client, "maintenance.severe_repair_estimates")) {
          const severeRes = await client.query<{ severe_oos: number }>(
            `
              SELECT COUNT(*)::int AS severe_oos
              FROM maintenance.severe_repair_estimates
              WHERE operating_company_id = $1::uuid
                AND estimate_status IN ('open', 'awaiting_approval', 'approved')
            `,
            [companyId]
          );
          severeOosCount = Number(severeRes.rows[0]?.severe_oos ?? 0);
        }

        let partsLowStockCount = 0;
        if (
          (await relationExists(client, "maintenance.parts_inventory")) &&
          (await columnExists(client, "maintenance", "parts_inventory", "on_hand_qty"))
        ) {
          const lowStockRes = await client.query<{ low_stock: number }>(
            `
              SELECT COUNT(*) FILTER (WHERE COALESCE(on_hand_qty, 0) <= 2)::int AS low_stock
              FROM maintenance.parts_inventory
              WHERE operating_company_id = $1::uuid
            `,
            [companyId]
          );
          partsLowStockCount = Number(lowStockRes.rows[0]?.low_stock ?? 0);
        }

        return {
          open_wos: Number(openWoCount ?? base.open_wos ?? 0),
          in_shop: Number(base.in_shop ?? 0),
          past_due_pm: pastDueCount,
          out_of_service: 0,
          open_damage: 0,
          avg_wo_age_days: Number(base.avg_wo_age_days ?? 0),
          mtd_repair_cost: Number(base.mtd_repair_cost ?? 0),
          mtd_parts_cost: 0,
          avg_wo_cost: Number(base.avg_wo_cost ?? 0),
          top_vendor: null,
          top_failure: null,
          pending_qbo: 0,
          past_due: pastDueCount,
          avg_close_days: avgCloseDays,
          open_dollars: openCost,
          tire_alerts: tireAlerts,
          pm_due: pmDueCount,
          dot_oos: dotOos,
          in_progress: inProgressCount,
          waiting_parts: waitingPartsCount,
          severe_oos: severeOosCount,
          road_service: roadServiceCount,
          parts_low_stock: partsLowStockCount,
          total_units: totalUnits,
          active_units: activeUnits,
        };
      });
      return payload;
    } catch (error) {
      req.log.warn({ err: error }, "maintenance dashboard kpis degraded to empty payload");
      return { ...EMPTY_KPI_PAYLOAD };
    }
  });
}
