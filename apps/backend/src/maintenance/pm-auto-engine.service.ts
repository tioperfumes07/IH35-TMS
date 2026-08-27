import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { extractSamsaraOdometerMi } from "../maint/pm-due.shared.js";
import {
  DEFAULT_PM_LOOKAHEAD_MILES,
  processMaintenancePredictorForOdometer,
  resolveNextDueOdometer,
  resolvePmLookaheadMiles,
  shouldTriggerPmAlert,
} from "../telematics/maintenance-predictor.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type PmAutoEngineScheduleRow = {
  id: string;
  unit_id: string;
  label: string;
  interval_kind: "miles" | "hours" | "days";
  interval_value: number;
  last_service_odometer: number | null;
  next_due_odometer: number | null;
};

export type PmAutoEngineEvaluation = "due" | "near_due" | "current";

export type PmAutoEngineRunResult = {
  schedules_evaluated: number;
  work_orders_created: number;
  alerts_created: number;
};

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const settingsBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  is_paused: z.boolean(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: DbClient) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await assertCompanyMembership(client, userId, companyId);
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    return fn(client as DbClient);
  });
}

export function evaluatePmAutoEngineStatus(
  currentOdometer: number | null,
  nextDueOdometer: number | null,
  lookaheadMiles = resolvePmLookaheadMiles()
): PmAutoEngineEvaluation {
  if (currentOdometer == null || nextDueOdometer == null) return "current";
  if (currentOdometer >= nextDueOdometer) return "due";
  if (shouldTriggerPmAlert(currentOdometer, lookaheadMiles, nextDueOdometer)) return "near_due";
  return "current";
}

async function relationExists(client: DbClient, relation: string): Promise<boolean> {
  const res = await client.query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [relation]);
  return Boolean(res.rows[0]?.ok);
}

async function isEnginePaused(client: DbClient, operatingCompanyId: string): Promise<boolean> {
  if (!(await relationExists(client, "maintenance.pm_auto_engine_settings"))) return false;
  const res = await client.query<{ is_paused: boolean }>(
    `
      SELECT COALESCE(is_paused, false) AS is_paused
      FROM maintenance.pm_auto_engine_settings
      WHERE operating_company_id = $1::uuid
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  return Boolean(res.rows[0]?.is_paused);
}

async function hasOpenPmWorkOrder(
  client: DbClient,
  input: { operating_company_id: string; unit_id: string; pm_schedule_id: string }
): Promise<boolean> {
  const res = await client.query<{ id: string }>(
    `
      SELECT w.id::text
      FROM maintenance.work_orders w
      WHERE w.operating_company_id = $1::uuid
        AND w.unit_id = $2::uuid
        AND w.wo_type = 'pm'
        AND w.status::text IN ('open', 'in_progress', 'waiting_parts')
        AND (
          w.origin = 'pm_schedule'
          OR w.description ILIKE $3
        )
      LIMIT 1
    `,
    [input.operating_company_id, input.unit_id, `%[pm_auto] schedule ${input.pm_schedule_id}%`]
  );
  return res.rows.length > 0;
}

async function appendPmAutoLog(
  client: DbClient,
  input: {
    run_id: string | null;
    operating_company_id: string;
    pm_schedule_id: string;
    unit_id: string;
    action: string;
    work_order_id?: string | null;
    pm_alert_id?: string | null;
    detail?: Record<string, unknown>;
  }
): Promise<void> {
  if (!(await relationExists(client, "maintenance.pm_auto_wo_log"))) return;
  await client.query(
    `
      INSERT INTO maintenance.pm_auto_wo_log (
        run_id, operating_company_id, pm_schedule_id, unit_id, action, work_order_id, pm_alert_id, detail
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid, $7::uuid, $8::jsonb)
    `,
    [
      input.run_id,
      input.operating_company_id,
      input.pm_schedule_id,
      input.unit_id,
      input.action,
      input.work_order_id ?? null,
      input.pm_alert_id ?? null,
      input.detail ? JSON.stringify(input.detail) : null,
    ]
  );
}

async function createPmAutoWorkOrder(
  client: DbClient,
  input: {
    operating_company_id: string;
    unit_id: string;
    schedule: PmAutoEngineScheduleRow;
    current_odometer: number;
    occurred_at: string;
  }
): Promise<string | null> {
  if (!(await relationExists(client, "maintenance.work_orders"))) return null;

  const display = await client.query<{ display_id: string; sequence: number }>(
    `
      SELECT display_id, sequence
      FROM maintenance.next_wo_display_id($1::uuid, 'PM', COALESCE($2::date, CURRENT_DATE), $3::uuid)
    `,
    [input.unit_id, input.occurred_at, input.operating_company_id]
  );
  const displayId = display.rows[0]?.display_id ?? null;
  const sequence = Number(display.rows[0]?.sequence ?? 0) || null;
  const description = `[pm_auto] schedule ${input.schedule.id}: ${input.schedule.label} due at ${input.current_odometer} mi`;

  const woRes = await client.query<{ id: string }>(
    `
      INSERT INTO maintenance.work_orders (
        operating_company_id,
        wo_type,
        source_type,
        status,
        unit_id,
        opened_at,
        repair_location,
        description,
        display_id,
        unit_sequence,
        origin,
        wo_title
      )
      VALUES (
        $1::uuid,
        'pm',
        'IS',
        'open',
        $2::uuid,
        $3::timestamptz,
        'in_house',
        $4,
        $5,
        $6,
        'pm_schedule',
        $7
      )
      RETURNING id::text
    `,
    [
      input.operating_company_id,
      input.unit_id,
      input.occurred_at,
      description,
      displayId,
      sequence,
      `PM Auto — ${input.schedule.label}`,
    ]
  );
  const createdWorkOrder = woRes.rows[0];
  if (!createdWorkOrder?.id) throw new Error("pm_auto_work_order_insert_returned_no_row");
  return createdWorkOrder.id;
}

async function loadUnitOdometers(
  client: DbClient,
  operatingCompanyId: string,
  unitIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (unitIds.length === 0) return map;

  // PRIMARY: live odometer from the Samsara stats-poll ingest (#1289). The fleet POLLS rather than
  // receiving odometer webhooks, so the integrations.samsara_vehicles.raw_payload below is empty for
  // odometer — without this, every unit was skipped as "no odometer" and the PM auto-engine did nothing.
  const liveRes = await client.query<{ unit_id: string; odometer_mi: number | string | null }>(
    `
      SELECT unit_id::text AS unit_id, odometer_mi
      FROM telematics.vehicle_latest_position
      WHERE operating_company_id = $1::uuid
        AND unit_id = ANY($2::uuid[])
        AND odometer_mi IS NOT NULL
    `,
    [operatingCompanyId, unitIds]
  );
  for (const row of liveRes.rows) {
    const odo = Number(row.odometer_mi);
    if (Number.isFinite(odo)) map.set(row.unit_id, Math.round(odo));
  }

  // FALLBACK: webhook raw_payload for any unit without a live stats-poll fix yet.
  const res = await client.query<{ unit_id: string; raw_payload: unknown }>(
    `
      SELECT DISTINCT ON (sv.local_unit_id)
        sv.local_unit_id::text AS unit_id,
        sv.raw_payload
      FROM integrations.samsara_vehicles sv
      WHERE sv.operating_company_id = $1::uuid
        AND sv.local_unit_id = ANY($2::uuid[])
      ORDER BY sv.local_unit_id, sv.last_seen_at DESC NULLS LAST
    `,
    [operatingCompanyId, unitIds]
  );

  for (const row of res.rows) {
    if (map.has(row.unit_id)) continue;
    const odometer = extractSamsaraOdometerMi(row.raw_payload);
    if (odometer != null) map.set(row.unit_id, odometer);
  }
  return map;
}

async function listActiveSchedules(client: DbClient, operatingCompanyId: string): Promise<PmAutoEngineScheduleRow[]> {
  if (!(await relationExists(client, "maintenance.pm_schedules"))) return [];
  const res = await client.query<PmAutoEngineScheduleRow>(
    `
      SELECT
        id::text,
        unit_id::text,
        label,
        interval_kind::text AS interval_kind,
        interval_value,
        last_service_odometer,
        next_due_odometer
      FROM maintenance.pm_schedules
      WHERE operating_company_id = $1::uuid
        AND is_active = true
    `,
    [operatingCompanyId]
  );
  return res.rows;
}

export async function runPmAutoEngineForTenant(
  client: DbClient,
  operatingCompanyId: string,
  options: { trigger_source?: "cron" | "manual"; run_id?: string | null } = {}
): Promise<PmAutoEngineRunResult> {
  const triggerSource = options.trigger_source ?? "cron";
  let runId = options.run_id ?? null;

  if (await isEnginePaused(client, operatingCompanyId)) {
    if (runId && (await relationExists(client, "maintenance.pm_schedule_runs"))) {
      await client.query(
        `
          UPDATE maintenance.pm_schedule_runs
          SET status = 'skipped', finished_at = now(), error_message = 'engine_paused'
          WHERE id = $1::uuid
        `,
        [runId]
      );
    }
    return { schedules_evaluated: 0, work_orders_created: 0, alerts_created: 0 };
  }

  if (!runId && (await relationExists(client, "maintenance.pm_schedule_runs"))) {
    const runRes = await client.query<{ id: string }>(
      `
        INSERT INTO maintenance.pm_schedule_runs (
          operating_company_id, status, trigger_source
        )
        VALUES ($1::uuid, 'running', $2)
        RETURNING id::text
      `,
      [operatingCompanyId, triggerSource]
    );
    const createdRun = runRes.rows[0];
    if (!createdRun?.id) throw new Error("pm_auto_run_insert_returned_no_row");
    runId = createdRun.id;
  }

  const occurredAt = new Date().toISOString();
  const schedules = await listActiveSchedules(client, operatingCompanyId);
  const unitIds = [...new Set(schedules.map((s) => s.unit_id))];
  const odometerByUnit = await loadUnitOdometers(client, operatingCompanyId, unitIds);

  let workOrdersCreated = 0;
  let alertsCreated = 0;
  // MAINT-PM-ENGINE-01: a run that evaluated schedules and achieved nothing because every unit was
  // missing its prerequisite is NOT a success. Prod carried 3,554 runs recorded status='completed',
  // error_message NULL, 0 created — while 41,070 of 41,070 evaluations logged skipped_no_odometer.
  // Counting the skips is what lets the finalize step below tell "nothing to do" from "did nothing".
  let skippedNoOdometer = 0;

  try {
    for (const schedule of schedules) {
      const currentOdometer = odometerByUnit.get(schedule.unit_id) ?? null;
      if (currentOdometer == null) {
        await appendPmAutoLog(client, {
          run_id: runId,
          operating_company_id: operatingCompanyId,
          pm_schedule_id: schedule.id,
          unit_id: schedule.unit_id,
          action: "skipped_no_odometer",
          detail: { label: schedule.label },
        });
        skippedNoOdometer += 1;
        continue;
      }

      const nextDue = resolveNextDueOdometer(schedule, currentOdometer);
      const status = evaluatePmAutoEngineStatus(currentOdometer, nextDue);

      if (status === "current") continue;

      if (status === "near_due") {
        const predictor = await processMaintenancePredictorForOdometer(client, {
          operating_company_id: operatingCompanyId,
          unit_id: schedule.unit_id,
          odometer_mi: currentOdometer,
          occurred_at: occurredAt,
        });
        alertsCreated += predictor.alerts_created;
        if (predictor.alerts_created > 0) {
          await appendPmAutoLog(client, {
            run_id: runId,
            operating_company_id: operatingCompanyId,
            pm_schedule_id: schedule.id,
            unit_id: schedule.unit_id,
            action: "near_due_alert",
            detail: { current_odometer: currentOdometer, next_due_odometer: nextDue },
          });
        }
        continue;
      }

      if (await hasOpenPmWorkOrder(client, {
        operating_company_id: operatingCompanyId,
        unit_id: schedule.unit_id,
        pm_schedule_id: schedule.id,
      })) {
        await appendPmAutoLog(client, {
          run_id: runId,
          operating_company_id: operatingCompanyId,
          pm_schedule_id: schedule.id,
          unit_id: schedule.unit_id,
          action: "skipped_open_wo",
          detail: { current_odometer: currentOdometer, next_due_odometer: nextDue },
        });
        continue;
      }

      const workOrderId = await createPmAutoWorkOrder(client, {
        operating_company_id: operatingCompanyId,
        unit_id: schedule.unit_id,
        schedule,
        current_odometer: currentOdometer,
        occurred_at: occurredAt,
      });

      if (workOrderId) {
        workOrdersCreated += 1;
        await appendPmAutoLog(client, {
          run_id: runId,
          operating_company_id: operatingCompanyId,
          pm_schedule_id: schedule.id,
          unit_id: schedule.unit_id,
          action: "wo_created",
          work_order_id: workOrderId,
          detail: { current_odometer: currentOdometer, next_due_odometer: nextDue },
        });
      }
    }

    // MAINT-PM-ENGINE-01 — run-level honesty. A cron that produced nothing must not report
    // 'completed' with a NULL error, because that is indistinguishable from a run with nothing to
    // do. 'skipped' is an existing member of pm_schedule_runs_status_check
    // ('running','completed','failed','skipped') and is already used for engine_paused, so this
    // needs NO migration. The diagnostic names the missing prerequisite and the scope affected.
    const noEffect = workOrdersCreated === 0 && alertsCreated === 0;
    let runStatus = "completed";
    let runDiagnostic: string | null = null;

    if (schedules.length === 0) {
      runStatus = "skipped";
      runDiagnostic =
        "no_active_pm_schedules: 0 active PM schedules for this entity — no unit is under " +
        "preventive-maintenance coverage. This is a finding, not a quiet no-op.";
    } else if (noEffect && skippedNoOdometer === schedules.length) {
      runStatus = "skipped";
      runDiagnostic =
        `no_odometer_for_all_units: all ${schedules.length} evaluated schedule(s) across ` +
        `${unitIds.length} unit(s) were skipped for a missing odometer reading in ` +
        "telematics.vehicle_latest_position. Nothing was created. Check that the schedules point " +
        "at real, telemetry-reporting units — not deactivated or demo units.";
    }

    if (runId && (await relationExists(client, "maintenance.pm_schedule_runs"))) {
      await client.query(
        `
          UPDATE maintenance.pm_schedule_runs
          SET
            status = $5,
            finished_at = now(),
            schedules_evaluated = $2,
            work_orders_created = $3,
            alerts_created = $4,
            error_message = $6
          WHERE id = $1::uuid
        `,
        [runId, schedules.length, workOrdersCreated, alertsCreated, runStatus, runDiagnostic]
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (runId && (await relationExists(client, "maintenance.pm_schedule_runs"))) {
      await client.query(
        `
          UPDATE maintenance.pm_schedule_runs
          SET status = 'failed', finished_at = now(), error_message = $2
          WHERE id = $1::uuid
        `,
        [runId, message.slice(0, 2000)]
      );
    }
    throw error;
  }

  return {
    schedules_evaluated: schedules.length,
    work_orders_created: workOrdersCreated,
    alerts_created: alertsCreated,
  };
}

export async function runPmAutoEngineCronTick(): Promise<void> {
  await withLuciaBypass(async (client) => {
    const companies = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM org.companies WHERE is_active = true AND deactivated_at IS NULL ORDER BY id`
    );
    for (const company of companies.rows) {
      assertTenantContext(String(company.id ?? ""), "maintenance.pm_auto_engine_cron");
      // membership-scope-exempt: internally-iterated-active-company
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [company.id]);
      await runPmAutoEngineForTenant(client as DbClient, company.id, { trigger_source: "cron" });
    }
  });
}

export async function registerMaintenancePmAutoEngineRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/pm-auto-engine/runs", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const payload = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      if (!(await relationExists(client, "maintenance.pm_schedule_runs"))) {
        return { runs: [], settings: { is_paused: false }, lookahead_miles: DEFAULT_PM_LOOKAHEAD_MILES };
      }

      const runsRes = await client.query(
        `
          SELECT
            id::text,
            started_at::text,
            finished_at::text,
            status,
            schedules_evaluated,
            work_orders_created,
            alerts_created,
            trigger_source,
            error_message
          FROM maintenance.pm_schedule_runs
          WHERE operating_company_id = $1::uuid
          ORDER BY started_at DESC
          LIMIT $2
        `,
        [parsed.data.operating_company_id, parsed.data.limit]
      );

      const logsRes = await client.query(
        `
          SELECT
            l.id::text,
            l.run_id::text,
            l.pm_schedule_id::text,
            l.unit_id::text,
            l.action,
            l.work_order_id::text,
            wo.display_id AS work_order_display_id,
            l.created_at::text,
            s.label AS schedule_label,
            u.unit_number
          FROM maintenance.pm_auto_wo_log l
          LEFT JOIN maintenance.pm_schedules s ON s.id = l.pm_schedule_id
          LEFT JOIN mdata.units u ON u.id = l.unit_id
                                  AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid
          LEFT JOIN maintenance.work_orders wo ON wo.id = l.work_order_id
                                               AND wo.operating_company_id = l.operating_company_id
          WHERE l.operating_company_id = $1::uuid
          ORDER BY l.created_at DESC
          LIMIT $2
        `,
        [parsed.data.operating_company_id, parsed.data.limit]
      );

      const settingsRes = await client.query(
        `
          SELECT is_paused, paused_at::text, updated_at::text
          FROM maintenance.pm_auto_engine_settings
          WHERE operating_company_id = $1::uuid
          LIMIT 1
        `,
        [parsed.data.operating_company_id]
      );

      return {
        runs: runsRes.rows,
        recent_log: logsRes.rows,
        settings: settingsRes.rows[0] ?? { is_paused: false },
        lookahead_miles: resolvePmLookaheadMiles(),
      };
    });

    return payload;
  });

  app.post("/api/v1/maintenance/pm-auto-engine/settings", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = settingsBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const result = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      await client.query(
        `
          INSERT INTO maintenance.pm_auto_engine_settings (
            operating_company_id, is_paused, paused_at, paused_by_user_uuid, updated_at
          )
          VALUES ($1::uuid, $2, CASE WHEN $2 THEN now() ELSE NULL END, CASE WHEN $2 THEN $3::uuid ELSE NULL END, now())
          ON CONFLICT (operating_company_id) DO UPDATE
          SET
            is_paused = EXCLUDED.is_paused,
            paused_at = EXCLUDED.paused_at,
            paused_by_user_uuid = EXCLUDED.paused_by_user_uuid,
            updated_at = now()
        `,
        [parsed.data.operating_company_id, parsed.data.is_paused, user.uuid]
      );
      await appendCrudAudit(client, user.uuid, "maintenance.pm_auto_engine.settings_updated", {
        operating_company_id: parsed.data.operating_company_id,
        is_paused: parsed.data.is_paused,
      });
      return { is_paused: parsed.data.is_paused };
    });

    return result;
  });

  app.post("/api/v1/maintenance/pm-auto-engine/run-now", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const result = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const run = await runPmAutoEngineForTenant(client, parsed.data.operating_company_id, {
        trigger_source: "manual",
      });
      await appendCrudAudit(client, user.uuid, "maintenance.pm_auto_engine.manual_run", {
        operating_company_id: parsed.data.operating_company_id,
        ...run,
      });
      return run;
    });

    return result;
  });
}
