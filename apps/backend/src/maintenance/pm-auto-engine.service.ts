import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { isEnabled } from "../lib/feature-flags/service.js";
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

export type UnitOdometer = {
  odometer: number;
  source: "unit_stop_events" | "odometer_readings";
  read_at: string | null;
};

/**
 * E-14 (ORDERS 2026-10-01, CC-1 row 1) odometer source order, nothing else:
 *   1. telematics.unit_stop_events -- the latest stop that carried an odometer (E-03, the Lead's stop
 *      engine, persisted). Feature-detected: until that table is live this tier no-ops ("E-03 pending").
 *   2. telematics.odometer_readings -- the E-06 daily snapshot ledger, latest measured/entered row.
 *   3. ABSENT -- the unit is skipped with a stated reason. Never 0, never interpolated, never guessed.
 */
async function loadUnitOdometers(
  client: DbClient,
  operatingCompanyId: string,
  unitIds: string[]
): Promise<{ byUnit: Map<string, UnitOdometer>; stopEventsLive: boolean }> {
  const byUnit = new Map<string, UnitOdometer>();
  const stopEventsLive = await relationExists(client, "telematics.unit_stop_events");
  if (unitIds.length === 0) return { byUnit, stopEventsLive };

  if (stopEventsLive) {
    const stops = await client.query<{ unit_id: string; odometer_mi: number | string; read_at: string | null }>(
      `
        SELECT DISTINCT ON (unit_id)
          unit_id::text AS unit_id, odometer_mi, COALESCE(odometer_read_at, started_at)::text AS read_at
        FROM telematics.unit_stop_events
        WHERE unit_id = ANY($1::uuid[])
          AND odometer_mi IS NOT NULL
          AND COALESCE(odometer_note, '') <> 'ABSENT'
        ORDER BY unit_id, started_at DESC
      `,
      [unitIds]
    );
    for (const row of stops.rows) {
      const odo = Number(row.odometer_mi);
      if (Number.isFinite(odo)) byUnit.set(row.unit_id, { odometer: Math.round(odo), source: "unit_stop_events", read_at: row.read_at });
    }
  }

  const snapshot = await client.query<{ unit_id: string; odometer_miles: number | string; read_at: string }>(
    `
      SELECT DISTINCT ON (unit_id) unit_id::text AS unit_id, odometer_miles, read_at::text AS read_at
      FROM telematics.odometer_readings
      WHERE operating_company_id = $1::uuid
        AND unit_id = ANY($2::uuid[])
        AND confidence IN ('measured', 'entered')
        AND odometer_miles IS NOT NULL
      ORDER BY unit_id, read_at DESC
    `,
    [operatingCompanyId, unitIds]
  );
  for (const row of snapshot.rows) {
    if (byUnit.has(row.unit_id)) continue;
    const odo = Number(row.odometer_miles);
    if (Number.isFinite(odo)) byUnit.set(row.unit_id, { odometer: Math.round(odo), source: "odometer_readings", read_at: row.read_at });
  }
  return { byUnit, stopEventsLive };
}

/** ORDERS 2026-10-01 rule 2: creating a work order touches a business record -- flag-OFF by default. */
export const PM_AUTO_ENGINE_CREATE_WORK_ORDERS_FLAG = "PM_AUTO_ENGINE_CREATE_WORK_ORDERS";

/** last_service_odometer NULL or <= 1 with no next_due_odometer is ABSENT, never a guessed baseline. */
export function pmScheduleBaselineAbsentReason(schedule: Pick<PmAutoEngineScheduleRow, "interval_kind" | "last_service_odometer" | "next_due_odometer">): string | null {
  if (schedule.interval_kind !== "miles") {
    return `${schedule.interval_kind}-interval schedule: maintenance.pm_schedules carries no last-service date, so it cannot be evaluated`;
  }
  if (schedule.next_due_odometer != null) return null;
  if (schedule.last_service_odometer != null && Number(schedule.last_service_odometer) > 1) return null;
  return "no baseline PM odometer on file (last_service_odometer absent) -- awaiting the owner's real service history, never guessed";
}

async function listActiveSchedules(client: DbClient, operatingCompanyId: string): Promise<PmAutoEngineScheduleRow[]> {
  if (!(await relationExists(client, "maintenance.pm_schedules"))) return [];
  const res = await client.query<PmAutoEngineScheduleRow>(
    `
      SELECT
        ps.id::text,
        ps.unit_id::text,
        ps.label,
        ps.interval_kind::text AS interval_kind,
        ps.interval_value,
        ps.last_service_odometer,
        ps.next_due_odometer
      FROM maintenance.pm_schedules ps
      JOIN mdata.units u
        ON u.id = ps.unit_id
       AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = ps.operating_company_id
       AND u.deactivated_at IS NULL
      WHERE ps.operating_company_id = $1::uuid
        AND ps.is_active = true
        AND u.is_sample_data IS NOT TRUE
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
  const { byUnit: odometerByUnit, stopEventsLive } = await loadUnitOdometers(client, operatingCompanyId, unitIds);
  const createWorkOrders = await isEnabled(client, PM_AUTO_ENGINE_CREATE_WORK_ORDERS_FLAG, {
    operating_company_id: operatingCompanyId,
  });

  let workOrdersCreated = 0;
  let alertsCreated = 0;
  // MAINT-PM-ENGINE-01: a run that evaluated schedules and achieved nothing because every unit was
  // missing its prerequisite is NOT a success. Prod carried 3,554 runs recorded status='completed',
  // error_message NULL, 0 created — while 41,070 of 41,070 evaluations logged skipped_no_odometer.
  // Counting the skips is what lets the finalize step below tell "nothing to do" from "did nothing".
  let skippedNoOdometer = 0;
  let skippedNoBaseline = 0;

  try {
    for (const schedule of schedules) {
      const reading = odometerByUnit.get(schedule.unit_id) ?? null;
      if (reading == null) {
        await appendPmAutoLog(client, {
          run_id: runId,
          operating_company_id: operatingCompanyId,
          pm_schedule_id: schedule.id,
          unit_id: schedule.unit_id,
          action: "skipped_no_odometer",
          detail: {
            label: schedule.label,
            reason: stopEventsLive
              ? "ABSENT: no odometer in telematics.unit_stop_events or telematics.odometer_readings"
              : "ABSENT: E-03 pending (telematics.unit_stop_events not live) and no odometer in telematics.odometer_readings",
          },
        });
        skippedNoOdometer += 1;
        continue;
      }
      const currentOdometer = reading.odometer;
      const odometerDetail = { current_odometer: currentOdometer, odometer_source: reading.source, odometer_read_at: reading.read_at };

      const baselineAbsent = pmScheduleBaselineAbsentReason(schedule);
      if (baselineAbsent) {
        await appendPmAutoLog(client, {
          run_id: runId,
          operating_company_id: operatingCompanyId,
          pm_schedule_id: schedule.id,
          unit_id: schedule.unit_id,
          action: "skipped_no_baseline",
          detail: { label: schedule.label, reason: baselineAbsent, ...odometerDetail },
        });
        skippedNoBaseline += 1;
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
            detail: { ...odometerDetail, next_due_odometer: nextDue },
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
          detail: { ...odometerDetail, next_due_odometer: nextDue },
        });
        continue;
      }

      if (!createWorkOrders) {
        await appendPmAutoLog(client, {
          run_id: runId,
          operating_company_id: operatingCompanyId,
          pm_schedule_id: schedule.id,
          unit_id: schedule.unit_id,
          action: "due_wo_flag_off",
          detail: { ...odometerDetail, next_due_odometer: nextDue, flag: PM_AUTO_ENGINE_CREATE_WORK_ORDERS_FLAG },
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
          detail: { ...odometerDetail, next_due_odometer: nextDue },
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
    } else if (noEffect && skippedNoOdometer + skippedNoBaseline === schedules.length) {
      runStatus = "skipped";
      runDiagnostic =
        `nothing_evaluable: ${schedules.length} schedule(s) across ${unitIds.length} unit(s) -- ` +
        `${skippedNoOdometer} with no odometer (${stopEventsLive ? "unit_stop_events + odometer_readings" : "E-03 pending; odometer_readings"}), ` +
        `${skippedNoBaseline} with no baseline (awaiting the owner's service history). Per-unit reasons are in ` +
        "maintenance.pm_auto_wo_log for this run.";
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
      `SELECT DISTINCT c.id::text AS id
         FROM org.companies c
         JOIN maintenance.pm_schedules ps ON ps.operating_company_id = c.id AND ps.is_active = true
        WHERE c.is_active = true AND c.deactivated_at IS NULL
        ORDER BY 1`
    );
    for (const company of companies.rows) {
      assertTenantContext(String(company.id ?? ""), "maintenance.pm_auto_engine_cron");
      // membership-scope-exempt: internally-iterated-active-company
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [company.id]);
      await runPmAutoEngineForTenant(client as DbClient, company.id, { trigger_source: "cron" });
    }
  });
}

/** E-14: "+ on manual odometer entry" -- one tenant run, after the entry has committed. */
export async function runPmAutoEngineAfterManualOdometer(operatingCompanyId: string): Promise<void> {
  await withLuciaBypass(async (client) => {
    assertTenantContext(operatingCompanyId, "maintenance.pm_auto_engine_manual_odometer");
    // membership-scope-exempt: caller already authorised for this entity
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    await runPmAutoEngineForTenant(client as DbClient, operatingCompanyId, { trigger_source: "manual" });
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
