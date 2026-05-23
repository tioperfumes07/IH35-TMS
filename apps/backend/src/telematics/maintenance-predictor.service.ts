type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type PmScheduleRow = {
  id: string;
  interval_kind: "miles" | "hours" | "days";
  interval_value: number;
  last_service_odometer: number | null;
  next_due_odometer: number | null;
};

type ExistingAlertRow = {
  id: string;
};

export type MaintenancePredictorInput = {
  operating_company_id: string;
  unit_id: string;
  odometer_mi: number;
  occurred_at: string;
  lookahead_miles?: number;
};

export type MaintenancePredictorResult = {
  schedules_checked: number;
  alerts_created: number;
};

export const DEFAULT_PM_LOOKAHEAD_MILES = 500;

export function resolvePmLookaheadMiles(explicitLookahead?: number): number {
  if (Number.isFinite(explicitLookahead) && Number(explicitLookahead) >= 0) return Number(explicitLookahead);
  const fromEnv = Number(process.env.SAMSARA_PM_LOOKAHEAD_MILES ?? DEFAULT_PM_LOOKAHEAD_MILES);
  if (!Number.isFinite(fromEnv) || fromEnv < 0) return DEFAULT_PM_LOOKAHEAD_MILES;
  return Math.round(fromEnv);
}

export function shouldTriggerPmAlert(currentOdometer: number, lookaheadMiles: number, nextDueOdometer: number): boolean {
  return currentOdometer + lookaheadMiles >= nextDueOdometer;
}

export function resolveNextDueOdometer(schedule: PmScheduleRow, currentOdometer: number): number | null {
  if (schedule.next_due_odometer != null) return schedule.next_due_odometer;
  if (schedule.interval_kind !== "miles") return null;
  if (!Number.isFinite(schedule.interval_value) || schedule.interval_value <= 0) return null;
  const baseline = schedule.last_service_odometer ?? currentOdometer;
  return baseline + schedule.interval_value;
}

async function relationExists(client: DbClient, relation: string): Promise<boolean> {
  const res = await client.query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [relation]);
  return Boolean(res.rows[0]?.ok);
}

async function listActiveSchedules(client: DbClient, input: MaintenancePredictorInput): Promise<PmScheduleRow[]> {
  const tableExists = await relationExists(client, "maintenance.pm_schedules");
  if (!tableExists) return [];
  const res = await client.query<PmScheduleRow>(
    `
      SELECT
        id::text,
        interval_kind::text,
        interval_value,
        last_service_odometer,
        next_due_odometer
      FROM maintenance.pm_schedules
      WHERE operating_company_id = $1::uuid
        AND unit_id = $2::uuid
        AND is_active = true
    `,
    [input.operating_company_id, input.unit_id]
  );
  return res.rows;
}

async function hasOpenAlert(client: DbClient, input: { operating_company_id: string; unit_id: string; pm_schedule_id: string }): Promise<boolean> {
  const res = await client.query<ExistingAlertRow>(
    `
      SELECT id::text
      FROM maintenance.pm_alerts
      WHERE operating_company_id = $1::uuid
        AND unit_id = $2::uuid
        AND pm_schedule_id = $3::uuid
        AND state = 'open'
      LIMIT 1
    `,
    [input.operating_company_id, input.unit_id, input.pm_schedule_id]
  );
  return res.rows.length > 0;
}

export async function processMaintenancePredictorForOdometer(
  client: DbClient,
  input: MaintenancePredictorInput
): Promise<MaintenancePredictorResult> {
  const schedules = await listActiveSchedules(client, input);
  if (schedules.length === 0) return { schedules_checked: 0, alerts_created: 0 };

  const lookaheadMiles = resolvePmLookaheadMiles(input.lookahead_miles);
  let alertsCreated = 0;

  for (const schedule of schedules) {
    const nextDueOdometer = resolveNextDueOdometer(schedule, input.odometer_mi);
    if (nextDueOdometer == null) continue;
    if (!shouldTriggerPmAlert(input.odometer_mi, lookaheadMiles, nextDueOdometer)) continue;
    if (await hasOpenAlert(client, { operating_company_id: input.operating_company_id, unit_id: input.unit_id, pm_schedule_id: schedule.id })) continue;

    const insertRes = await client.query<{ id: string }>(
      `
        INSERT INTO maintenance.pm_alerts (
          operating_company_id,
          unit_id,
          pm_schedule_id,
          trigger_odometer,
          triggered_at,
          state
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::integer,
          $5::timestamptz,
          'open'
        )
        ON CONFLICT DO NOTHING
        RETURNING id::text
      `,
      [input.operating_company_id, input.unit_id, schedule.id, nextDueOdometer, input.occurred_at]
    );
    if (insertRes.rows.length > 0) alertsCreated += 1;
  }

  return {
    schedules_checked: schedules.length,
    alerts_created: alertsCreated,
  };
}
