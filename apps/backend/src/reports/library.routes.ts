import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { REPORT_LIBRARY, companyQuerySchema, currentAuthUser, getCurrentQuarterInfo, validationError, withCompanyScope } from "./shared.js";

const frequentlyRunQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  period: z.string().optional().default("7d"),
});

const runLogBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  report_id: z.string().min(1).max(120),
  report_name: z.string().min(1).max(200).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  duration_ms: z.number().int().min(0).optional(),
  rows_returned: z.number().int().min(0).optional(),
});

const scheduledQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const homeAttentionListQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const homeFleetSnapshotQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const HOME_REPORT_CACHE_MS = 30_000;
const homeAttentionReportCache = new Map<string, { exp: number; body: unknown }>();
const homeFleetReportCache = new Map<string, { exp: number; body: unknown }>();

export async function registerReportsLibraryRoutes(app: FastifyInstance) {
  async function relationExists(client: any, qualifiedName: string) {
    const res = await client.query(`SELECT to_regclass($1) AS rel`, [qualifiedName]);
    return Boolean(res.rows[0]?.rel);
  }

  async function columnExists(client: any, schema: string, table: string, column: string) {
    const res = await client.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
          AND column_name = $3
        LIMIT 1
      `,
      [schema, table, column]
    );
    return res.rows.length > 0;
  }

  app.get("/api/v1/reports/library", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    return { reports: REPORT_LIBRARY };
  });

  app.get("/api/v1/reports/frequently-run", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = frequentlyRunQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const periodDays = query.data.period === "7d" ? 7 : 7;

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT report_id, count(*)::text AS run_count
          FROM reports.run_log
          WHERE operating_company_id = $1
            AND run_at >= (now() - ($2::int || ' days')::interval)
          GROUP BY report_id
          ORDER BY count(*) DESC
          LIMIT 8
        `,
        [query.data.operating_company_id, periodDays]
      );
      return res.rows as Array<{ report_id: string; run_count: string }>;
    });

    const countMap = new Map(rows.map((row) => [row.report_id, Number(row.run_count ?? 0)]));
    const ordered = [...REPORT_LIBRARY].sort((a, b) => (countMap.get(b.id) ?? 0) - (countMap.get(a.id) ?? 0));
    const top = ordered.slice(0, 8).map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      description: item.description,
      status: item.status,
      run_count: countMap.get(item.id) ?? 0,
      filters: "default",
      runs: countMap.get(item.id) ?? 0,
    }));
    return { rows: top };
  });

  app.get("/api/v1/reports/scheduled", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = scheduledQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT id, report_id, cadence, cadence_detail, recipient_roles, recipient_emails
          FROM reports.scheduled_reports
          WHERE operating_company_id = $1
            AND enabled = true
          ORDER BY created_at ASC
        `,
        [query.data.operating_company_id]
      );
      return res.rows as Array<{
        id: string;
        report_id: string;
        cadence: string;
        cadence_detail: string | null;
        recipient_roles: string[] | null;
        recipient_emails: string[] | null;
      }>;
    });
    return {
      rows: rows.map((row) => {
        const reportName = REPORT_LIBRARY.find((item) => item.id === row.report_id)?.name ?? row.report_id;
        const recipientRoles = (row.recipient_roles ?? []).join(", ");
        const recipientEmails = (row.recipient_emails ?? []).join(", ");
        const recipients = [recipientRoles, recipientEmails].filter(Boolean).join(" · ") || "—";
        return {
          id: row.id,
          report_id: row.report_id,
          cadence: row.cadence,
          cadence_detail: row.cadence_detail,
          cadence_label: row.cadence_detail ?? row.cadence,
          name: reportName,
          recipients,
        };
      }),
    };
  });

  app.get("/api/v1/reports/kpi-summary", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    try {
    const data = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const scheduledRes = await client.query(
        `SELECT count(*)::text AS cnt FROM reports.scheduled_reports WHERE operating_company_id = $1 AND enabled = true`,
        [query.data.operating_company_id]
      );
      const runRes = await client.query(
        `SELECT count(*)::text AS cnt FROM reports.run_log WHERE operating_company_id = $1 AND run_at >= now() - interval '7 days'`,
        [query.data.operating_company_id]
      );
      const arSumRes = await client.query(
        `
          SELECT COALESCE(SUM(total_open_cents), 0) AS total
          FROM views.ar_aging
          WHERE operating_company_id = $1
        `,
        [query.data.operating_company_id]
      );
      const trackedAssetsRes = await client.query(
        `
          SELECT CASE
            WHEN to_regclass('mdata.units') IS NULL THEN 0
            ELSE (
              SELECT count(*)::bigint
              FROM mdata.units u
              WHERE u.deactivated_at IS NULL
                AND (u.owner_company_id = $1 OR u.currently_leased_to_company_id = $1)
            )
          END AS total
        `,
        [query.data.operating_company_id]
      );
      const assignedWorkingRes = await client.query(
        `
          SELECT CASE
            WHEN to_regclass('mdata.loads') IS NULL THEN 0
            ELSE (
              SELECT count(*)::bigint
              FROM mdata.loads l
              WHERE l.operating_company_id = $1
                AND COALESCE(l.status::text, '') NOT IN ('draft', 'delivered', 'invoiced', 'paid', 'closed', 'cancelled')
            )
          END AS total
        `,
        [query.data.operating_company_id]
      );
      const maintPastDueRes = await client.query(
        `
          SELECT CASE
            WHEN to_regclass('maintenance.work_orders') IS NULL THEN 0
            ELSE (
              SELECT count(*)::bigint
              FROM maintenance.work_orders w
              WHERE w.operating_company_id = $1
                AND w.status NOT IN ('complete', 'cancelled')
                AND w.due_date IS NOT NULL
                AND w.due_date < CURRENT_DATE
            )
          END AS total
        `,
        [query.data.operating_company_id]
      );
      const openDamageRes = await client.query(
        `
          SELECT CASE
            WHEN to_regclass('safety.accidents') IS NULL THEN 0
            ELSE (
              SELECT count(*)::bigint
              FROM safety.accidents a
              WHERE a.operating_company_id = $1
                AND COALESCE(a.status::text, '') IN ('open', 'under-investigation')
            )
          END AS total
        `,
        [query.data.operating_company_id]
      );
      const pendingQboSyncRes = await client.query(
        `
          SELECT CASE
            WHEN to_regclass('outbox.events') IS NULL THEN 0
            ELSE (
              SELECT count(*)::bigint
              FROM outbox.events e
              WHERE e.delivered_at IS NULL
                AND e.failed_at IS NULL
                AND e.event_type ILIKE '%qbo%'
                AND EXISTS (
                  SELECT 1
                  FROM org.companies c
                  WHERE c.id = $1
                    AND (
                      e.payload->>'operating_company_id' = c.id::text
                      OR e.payload->>'company_id' = c.id::text
                    )
                )
            )
          END AS total
        `,
        [query.data.operating_company_id]
      );
      const liveUnitsRes = await client.query(
        `
          SELECT CASE
            WHEN to_regclass('mdata.units') IS NULL THEN 0
            ELSE (
              SELECT count(*)::bigint
              FROM mdata.units u
              WHERE u.deactivated_at IS NULL
                AND COALESCE(u.is_oos, false) = false
                AND COALESCE(u.status::text, '') <> 'OutOfService'
                AND (u.owner_company_id = $1 OR u.currently_leased_to_company_id = $1)
            )
          END AS total
        `,
        [query.data.operating_company_id]
      );
      return {
        scheduled: Number(((scheduledRes.rows[0] as { cnt?: string } | undefined)?.cnt ?? 0)),
        run_last_7d: Number(((runRes.rows[0] as { cnt?: string } | undefined)?.cnt ?? 0)),
        outstanding_ar_cents: Number(((arSumRes.rows[0] as { total?: string | number | bigint } | undefined)?.total ?? 0)),
        tracked_assets: Number(((trackedAssetsRes.rows[0] as { total?: string | number | bigint } | undefined)?.total ?? 0)),
        assigned_working: Number(((assignedWorkingRes.rows[0] as { total?: string | number | bigint } | undefined)?.total ?? 0)),
        maint_past_due: Number(((maintPastDueRes.rows[0] as { total?: string | number | bigint } | undefined)?.total ?? 0)),
        open_damage: Number(((openDamageRes.rows[0] as { total?: string | number | bigint } | undefined)?.total ?? 0)),
        pending_qbo_sync: Number(((pendingQboSyncRes.rows[0] as { total?: string | number | bigint } | undefined)?.total ?? 0)),
        live_units: Number(((liveUnitsRes.rows[0] as { total?: string | number | bigint } | undefined)?.total ?? 0)),
      };
    });

    return {
      available_reports: REPORT_LIBRARY.length,
      scheduled: data.scheduled,
      run_last_7d: data.run_last_7d,
      outstanding_ar_cents: data.outstanding_ar_cents,
      tracked_assets: data.tracked_assets,
      assigned_working: data.assigned_working,
      maint_past_due: data.maint_past_due,
      open_damage: data.open_damage,
      pending_qbo_sync: data.pending_qbo_sync,
      live_units: data.live_units,
      ifta_status: getCurrentQuarterInfo(),
    };
    } catch (error) {
      req.log.error({ err: error }, "/api/v1/reports/kpi-summary failed");
      return {
        available_reports: REPORT_LIBRARY.length,
        scheduled: 0,
        run_last_7d: 0,
        outstanding_ar_cents: 0,
        tracked_assets: 0,
        assigned_working: 0,
        maint_past_due: 0,
        open_damage: 0,
        pending_qbo_sync: 0,
        live_units: 0,
        ifta_status: getCurrentQuarterInfo(),
      };
    }
  });

  app.get("/api/v1/reports/home-attention-list", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = homeAttentionListQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const cacheKey = query.data.operating_company_id;
    const cached = homeAttentionReportCache.get(cacheKey);
    if (cached && cached.exp > Date.now()) return cached.body;

    try {
      const items = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        await client.query(`SET LOCAL statement_timeout = '5000ms'`);
        const companyId = query.data.operating_company_id;
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);

        const tenantSettingExpr = `current_setting('app.operating_company_id', true)::uuid`;
        const items: Array<{
          type: string;
          severity: "info" | "warning" | "error" | "critical";
          title: string;
          count: number;
          action_url: string;
          action_label: string;
        }> = [];

        let lateInFlightLoads = 0;
        const loadRelation = (await relationExists(client, "dispatch.loads"))
          ? { schema: "dispatch", table: "loads" }
          : (await relationExists(client, "mdata.loads"))
            ? { schema: "mdata", table: "loads" }
            : null;
        if (loadRelation) {
          const hasOperatingCompany = await columnExists(client, loadRelation.schema, loadRelation.table, "operating_company_id");
          const hasStatus = await columnExists(client, loadRelation.schema, loadRelation.table, "status");
          const lateColumnCandidates = ["delivery_due_at", "delivery_deadline_at", "scheduled_delivery_at", "eta_at", "delivery_at"];
          let lateColumn: string | null = null;
          for (const candidate of lateColumnCandidates) {
            if (await columnExists(client, loadRelation.schema, loadRelation.table, candidate)) {
              lateColumn = candidate;
              break;
            }
          }
          const whereParts: string[] = [];
          if (hasOperatingCompany) whereParts.push(`operating_company_id = ${tenantSettingExpr}`);
          if (hasStatus) {
            whereParts.push(
              `COALESCE(status::text, '') IN ('booked','planned','assigned','dispatched','at_pickup','in_transit','at_delivery','assigned_not_dispatched')`,
            );
          }
          if (lateColumn) {
            whereParts.push(`${lateColumn} IS NOT NULL AND ${lateColumn} < now()`);
          }
          if (whereParts.length > 0) {
            const res = await client.query(
              `
                SELECT count(*)::text AS total
                FROM ${loadRelation.schema}.${loadRelation.table}
                WHERE ${whereParts.join(" AND ")}
              `,
            );
            lateInFlightLoads = Number((res.rows[0] as { total?: string } | undefined)?.total ?? 0);
          }
        }
        items.push({
          type: "dispatch_loads_in_flight_late",
          severity: "critical",
          title: "In-flight loads running late",
          count: lateInFlightLoads,
          action_url: "/dispatch",
          action_label: "Open dispatch",
        });

        let maintenanceCriticalOrOverdue = 0;
        if (await relationExists(client, "maintenance.work_orders")) {
          const hasOperatingCompany = await columnExists(client, "maintenance", "work_orders", "operating_company_id");
          const hasStatus = await columnExists(client, "maintenance", "work_orders", "status");
          const hasPriority = await columnExists(client, "maintenance", "work_orders", "priority");
          const hasSeverity = await columnExists(client, "maintenance", "work_orders", "severity");
          const hasDueDate = await columnExists(client, "maintenance", "work_orders", "due_date");
          const whereParts: string[] = [];
          if (hasOperatingCompany) whereParts.push(`operating_company_id = ${tenantSettingExpr}`);
          if (hasStatus) whereParts.push(`COALESCE(status::text, '') NOT IN ('complete','completed','cancelled','void')`);
          const issueParts: string[] = [];
          if (hasPriority) issueParts.push(`lower(COALESCE(priority::text, '')) IN ('critical','urgent','high')`);
          if (hasSeverity) issueParts.push(`lower(COALESCE(severity::text, '')) IN ('critical','urgent','high')`);
          if (hasDueDate) issueParts.push(`due_date IS NOT NULL AND due_date < CURRENT_DATE`);
          if (issueParts.length > 0) whereParts.push(`(${issueParts.join(" OR ")})`);
          if (whereParts.length > 0) {
            const res = await client.query(
              `
                SELECT count(*)::text AS total
                FROM maintenance.work_orders
                WHERE ${whereParts.join(" AND ")}
              `,
            );
            maintenanceCriticalOrOverdue = Number((res.rows[0] as { total?: string } | undefined)?.total ?? 0);
          }
        }
        items.push({
          type: "maintenance_open_critical_or_overdue_pm",
          severity: "error",
          title: "Open critical or overdue PM work orders",
          count: maintenanceCriticalOrOverdue,
          action_url: "/maintenance",
          action_label: "Open maintenance",
        });

        let safetyOpenDriverIssues = 0;
        if (await relationExists(client, "safety.complaints")) {
          const hasOperatingCompany = await columnExists(client, "safety", "complaints", "operating_company_id");
          const hasStatus = await columnExists(client, "safety", "complaints", "status");
          const whereParts: string[] = [];
          if (hasOperatingCompany) whereParts.push(`operating_company_id = ${tenantSettingExpr}`);
          if (hasStatus) whereParts.push(`COALESCE(status::text, '') NOT IN ('resolved','closed','void','dismissed')`);
          if (whereParts.length > 0) {
            const res = await client.query(
              `
                SELECT count(*)::text AS total
                FROM safety.complaints
                WHERE ${whereParts.join(" AND ")}
              `,
            );
            safetyOpenDriverIssues = Number((res.rows[0] as { total?: string } | undefined)?.total ?? 0);
          }
        }
        items.push({
          type: "safety_open_driver_issues",
          severity: "warning",
          title: "Open safety driver issues",
          count: safetyOpenDriverIssues,
          action_url: "/safety",
          action_label: "Open safety",
        });

        let accountingOverdue = 0;
        if (await relationExists(client, "views.ap_aging")) {
          const apRes = await client.query(
            `
              SELECT count(*)::text AS total
              FROM views.ap_aging
              WHERE operating_company_id = ${tenantSettingExpr}
                AND (
                  COALESCE(bucket_31_60_cents, 0)
                  + COALESCE(bucket_61_90_cents, 0)
                  + COALESCE(bucket_91_plus_cents, 0)
                ) > 0
            `,
          );
          accountingOverdue += Number((apRes.rows[0] as { total?: string } | undefined)?.total ?? 0);
        }
        if (await relationExists(client, "views.ar_aging")) {
          const arRes = await client.query(
            `
              SELECT count(*)::text AS total
              FROM views.ar_aging
              WHERE operating_company_id = ${tenantSettingExpr}
                AND (
                  COALESCE(bucket_31_60_cents, 0)
                  + COALESCE(bucket_61_90_cents, 0)
                  + COALESCE(bucket_91_plus_cents, 0)
                ) > 0
            `,
          );
          accountingOverdue += Number((arRes.rows[0] as { total?: string } | undefined)?.total ?? 0);
        }
        items.push({
          type: "accounting_overdue_bills_customers",
          severity: "warning",
          title: "Overdue bills and customers",
          count: accountingOverdue,
          action_url: "/accounting",
          action_label: "Open accounting",
        });

        const rank: Record<"info" | "warning" | "error" | "critical", number> = {
          info: 0,
          warning: 1,
          error: 2,
          critical: 3,
        };
        return items
          .filter((item) => item.count > 0)
          .sort((a, b) => rank[b.severity] - rank[a.severity] || b.count - a.count)
          .slice(0, 8);
      });

      const body = { items };
      homeAttentionReportCache.set(cacheKey, { exp: Date.now() + HOME_REPORT_CACHE_MS, body });
      return body;
    } catch (error) {
      req.log.error({ err: error }, "/api/v1/reports/home-attention-list failed");
      return reply.code(503).send({ error: "timeout — please retry" });
    }
  });

  app.get("/api/v1/reports/home-fleet-snapshot", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = homeFleetSnapshotQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const cacheKey = query.data.operating_company_id;
    const cached = homeFleetReportCache.get(cacheKey);
    if (cached && cached.exp > Date.now()) return cached.body;

    try {
      const snapshot = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        await client.query(`SET LOCAL statement_timeout = '5000ms'`);
        const companyId = query.data.operating_company_id;
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);

      let trucks = 0;
      let flatbeds = 0;
      let dryVans = 0;
      let refrigerated = 0;
      let trailers = 0;

      if (await relationExists(client, "mdata.equipment")) {
        const equipmentHasOperatingCompany = await columnExists(client, "mdata", "equipment", "operating_company_id");
        const fleetRes = await client.query(
          `
            SELECT lower(COALESCE(equipment_type, '')) AS equipment_type, count(*)::text AS total
            FROM mdata.equipment
            WHERE deactivated_at IS NULL
              AND ${
                equipmentHasOperatingCompany
                  ? "operating_company_id = current_setting('app.operating_company_id', true)::uuid"
                  : "(owner_company_id = $1 OR currently_leased_to_company_id = $1)"
              }
            GROUP BY lower(COALESCE(equipment_type, ''))
          `,
          [companyId]
        );
        for (const row of fleetRes.rows as Array<{ equipment_type: string; total: string }>) {
          const type = row.equipment_type;
          const count = Number(row.total ?? 0);
          if (type.includes("flatbed")) flatbeds += count;
          if (type.includes("dry") && type.includes("van")) dryVans += count;
          if (type.includes("reefer") || type.includes("refrigerated")) refrigerated += count;
          if (type.includes("truck") || type.includes("tractor") || type.includes("power")) trucks += count;
          if (type.includes("trailer") || type.includes("flatbed") || (type.includes("dry") && type.includes("van")) || type.includes("reefer") || type.includes("refrigerated")) {
            trailers += count;
          }
        }
      }

      let inShop = 0;
      let roadside = 0;
      if (await relationExists(client, "maintenance.work_orders")) {
        const repairRes = await client.query(
          `
            SELECT lower(COALESCE(repair_location, '')) AS repair_location, count(*)::text AS total
            FROM maintenance.work_orders
            WHERE operating_company_id = $1
              AND status NOT IN ('complete', 'cancelled')
            GROUP BY lower(COALESCE(repair_location, ''))
          `,
          [companyId]
        );
        for (const row of repairRes.rows as Array<{ repair_location: string; total: string }>) {
          const location = row.repair_location;
          const count = Number(row.total ?? 0);
          if (location === "mobile_roadside") roadside += count;
          if (location.includes("shop") || location.includes("yard") || location === "in_house_shop") inShop += count;
        }
      }

      let outOfService = 0;
      let totalUnits = 0;
      let samsaraLive = 0;
      if (await relationExists(client, "mdata.units")) {
        const unitsHaveOperatingCompany = await columnExists(client, "mdata", "units", "operating_company_id");
        const unitsRes = await client.query(
          `
            SELECT
              count(*)::text AS total_units,
              count(*) FILTER (WHERE is_oos = true OR status::text = 'OutOfService')::text AS out_of_service,
              count(*) FILTER (WHERE updated_at >= now() - interval '6 hours')::text AS samsara_live
            FROM mdata.units
            WHERE deactivated_at IS NULL
              AND ${
                unitsHaveOperatingCompany
                  ? "operating_company_id = current_setting('app.operating_company_id', true)::uuid"
                  : "(owner_company_id = $1 OR currently_leased_to_company_id = $1)"
              }
          `,
          [companyId]
        );
        totalUnits = Number((unitsRes.rows[0] as { total_units?: string } | undefined)?.total_units ?? 0);
        outOfService = Number((unitsRes.rows[0] as { out_of_service?: string } | undefined)?.out_of_service ?? 0);
        samsaraLive = Number((unitsRes.rows[0] as { samsara_live?: string } | undefined)?.samsara_live ?? 0);
      }

      let assignedUnits = 0;
      if (await relationExists(client, "mdata.loads")) {
        const assignedRes = await client.query(
          `
            SELECT count(DISTINCT assigned_unit_id)::text AS total
            FROM mdata.loads
            WHERE operating_company_id = $1
              AND assigned_unit_id IS NOT NULL
              AND status::text IN (
                'booked',
                'planned',
                'assigned',
                'dispatched',
                'at_pickup',
                'in_transit',
                'at_delivery',
                'assigned_not_dispatched',
                'delivered_pending_docs',
                'completed_docs_received'
              )
          `,
          [companyId]
        );
        assignedUnits = Number((assignedRes.rows[0] as { total?: string } | undefined)?.total ?? 0);
      }

      const idleUnits = Math.max(0, totalUnits - assignedUnits);
      const noSignal6h = Math.max(0, totalUnits - samsaraLive);

      return {
        trucks,
        flatbeds,
        dry_vans: dryVans,
        refrigerated,
        trailers,
        in_shop: inShop,
        out_of_service: outOfService,
        assigned_units: assignedUnits,
        idle_units: idleUnits,
        samsara_live: samsaraLive,
        no_signal_6h: noSignal6h,
        roadside,
      };
      });

      homeFleetReportCache.set(cacheKey, { exp: Date.now() + HOME_REPORT_CACHE_MS, body: snapshot });
      return snapshot;
    } catch (error) {
      req.log.error({ err: error }, "/api/v1/reports/home-fleet-snapshot failed");
      return reply.code(503).send({ error: "timeout — please retry" });
    }
  });

  app.post("/api/v1/reports/run-log", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const body = runLogBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
        const reportMeta = REPORT_LIBRARY.find((item) => item.id === body.data.report_id);
        await client.query(
          `
            INSERT INTO reports.run_log (
              operating_company_id, report_id, report_name, user_id, user_role, filters, duration_ms, rows_returned
            )
            VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
          `,
          [
            body.data.operating_company_id,
            body.data.report_id,
            body.data.report_name ?? reportMeta?.name ?? body.data.report_id,
            user.uuid,
            user.role,
            JSON.stringify(body.data.filters ?? {}),
            body.data.duration_ms ?? null,
            body.data.rows_returned ?? null,
          ]
        );
      });
    } catch (error) {
      req.log.warn({ err: error }, "reports.run-log insert failed (best effort)");
    }

    return { ok: true };
  });
}
