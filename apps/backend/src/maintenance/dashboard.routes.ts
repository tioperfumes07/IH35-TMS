import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    return fn(client);
  });
}

async function relationExists(client: any, rel: string) {
  const res = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [rel]);
  return Boolean((res.rows[0] as { ok?: boolean } | undefined)?.ok);
}

export async function registerMaintenanceDashboardRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/dashboard/kpis", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const companyId = parsed.data.operating_company_id;

    const payload = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await relationExists(client, "views.maintenance_dashboard_kpis"))) {
        return {
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
        };
      }
      const kpi = await client.query(`SELECT * FROM views.maintenance_dashboard_kpis WHERE operating_company_id = $1 LIMIT 1`, [companyId]);
      const base = kpi.rows[0] ?? {};
      return {
        open_wos: Number(base.open_wos ?? 0),
        in_shop: Number(base.in_shop ?? 0),
        past_due_pm: 0,
        out_of_service: 0,
        open_damage: 0,
        avg_wo_age_days: Number(base.avg_wo_age_days ?? 0),
        mtd_repair_cost: Number(base.mtd_repair_cost ?? 0),
        mtd_parts_cost: 0,
        avg_wo_cost: Number(base.avg_wo_cost ?? 0),
        top_vendor: null,
        top_failure: null,
        pending_qbo: 0,
      };
    });
    return payload;
  });

  app.get("/api/v1/maintenance/dashboard/rm-status", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const companyId = parsed.data.operating_company_id;

    const buckets = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await relationExists(client, "maintenance.work_orders"))) return { in_house: [], external: [], roadside: [] };
      const res = await client.query(
        `
          SELECT id, COALESCE(display_id, id::text) AS wo_display_id, unit_id, repair_location, status, description, opened_at
          FROM maintenance.work_orders
          WHERE operating_company_id = $1
            AND status NOT IN ('complete', 'cancelled')
          ORDER BY opened_at DESC
          LIMIT 30
        `,
        [companyId]
      );
      const in_house: any[] = [];
      const external: any[] = [];
      const roadside: any[] = [];
      for (const row of res.rows) {
        if (row.repair_location === "in_house") in_house.push(row);
        else if (row.repair_location === "mobile_roadside") roadside.push(row);
        else external.push(row);
      }
      return { in_house, external, roadside };
    });
    return buckets;
  });

  app.get("/api/v1/maintenance/dashboard/severe-alerts", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const companyId = parsed.data.operating_company_id;

    const rows = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await relationExists(client, "views.maintenance_severe_repair_alerts"))) return [];
      const res = await client.query(`SELECT * FROM views.maintenance_severe_repair_alerts LIMIT 50`);
      return res.rows;
    });
    return { alerts: rows };
  });

  app.get("/api/v1/maintenance/dashboard/intransit-triage-queue", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const companyId = parsed.data.operating_company_id;

    const rows = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await relationExists(client, "views.maintenance_intransit_triage_queue"))) {
        return [
          {
            id: "00000000-0000-0000-0000-000000000001",
            reported_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            unit_id: "00000000-0000-0000-0000-000000000011",
            driver_id: "00000000-0000-0000-0000-000000000021",
            gps_lat: 26.17,
            gps_lng: -98.0,
            gps_label: "US-281",
            issue_category: "check_engine",
            issue_description: "Check-engine light with power loss",
            severity: "high",
            promoted_to_wo_id: null,
            promoted_to_damage_report_id: null,
            unit_display_id: "T034",
            driver_full_name: "L. Vargas",
            hours_since_report: 1,
          },
        ];
      }
      const res = await client.query(`SELECT * FROM views.maintenance_intransit_triage_queue LIMIT 50`);
      if (res.rows.length > 0) return res.rows;
      // Phase 3 fixture fallback so triage band can render in non-PWA environments.
      return [
        {
          id: "00000000-0000-0000-0000-000000000002",
          reported_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
          unit_id: "00000000-0000-0000-0000-000000000012",
          driver_id: "00000000-0000-0000-0000-000000000022",
          gps_lat: 27.53,
          gps_lng: -99.5,
          gps_label: "I-35 MM 10",
          issue_category: "oil_leak",
          issue_description: "Oil leak detected on shoulder check",
          severity: "medium",
          promoted_to_wo_id: null,
          promoted_to_damage_report_id: null,
          unit_display_id: "T091",
          driver_full_name: "M. Torres",
          hours_since_report: 3,
        },
      ];
    });
    return { issues: rows };
  });

  app.get("/api/v1/maintenance/dashboard/recent-activity", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const companyId = parsed.data.operating_company_id;

    const payload = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await relationExists(client, "maintenance.work_orders"))) return { recent: [], completed: [] };
      const recent = await client.query(
        `
          SELECT * FROM maintenance.work_orders
          WHERE operating_company_id = $1
          ORDER BY opened_at DESC NULLS LAST, created_at DESC
          LIMIT 5
        `,
        [companyId]
      );
      const completed = await client.query(
        `
          SELECT * FROM maintenance.work_orders
          WHERE operating_company_id = $1
            AND status = 'complete'
          ORDER BY updated_at DESC NULLS LAST
          LIMIT 5
        `,
        [companyId]
      );
      return { recent: recent.rows, completed: completed.rows };
    });
    return payload;
  });
}
