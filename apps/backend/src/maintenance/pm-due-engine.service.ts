/**
 * ROUND 301 T-29 -- PM DUE ENGINE, off the odometer ledger.
 *
 * Owner verbatim: "WE BUILT THE MAINTENANCE CATALOG ALREADY, AVERAGING 12K MILES PER MONTH THE
 * PM EVERY 25K MILES ... I BELIEVE TO SAVE SPACE, WE WOULD CALL SAMSARA ONLY 1 TIME A DAY FOR
 * THE MILEAGE ... ILL INPUT MILEAGE MANUALLY."
 *
 * E-15 (ORDERS 2026-10-01 row 2): current odometer comes from the ONE shared loader
 * (pm-current-odometer.ts: telematics.unit_stop_events -> telematics.odometer_readings -> ABSENT), the
 * same source as the E-14 cron; the mileage RATE reads telematics.odometer_readings. Already-ingested
 * data only -- this file makes no Samsara API call of any kind, directly or transitively. Manual odometer entries (source='manual') are a FIRST-CLASS input here, exactly
 * as real as a 'samsara' row -- both land in the same ledger and this engine reads both alike.
 *
 * NEVER the owner's 12,000-mi/month rule of thumb: every projected due date comes from THAT
 * UNIT'S OWN trailing 90-day mileage rate, computed live, or it is NULL with a stated reason.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { projectPmDueDateFromRate } from "../maint/pm-due.shared.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { absentOdometerReason, loadPmOdometers, type PmOdometerSource } from "./pm-current-odometer.js";
import { pmScheduleBaselineAbsentReason } from "./pm-auto-engine.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type UnitMileageRate = {
  miles_per_day: number | null;
  reason: string | null;
};

export type PmDueEngineRow = {
  pm_schedule_id: string;
  unit_id: string;
  unit_number: string;
  label: string;
  interval_kind: string;
  /** Miles schedules only; null for a days interval. */
  interval_miles: number | null;
  interval_days: number | null;
  last_service_odometer: number | null;
  current_odometer: number | null;
  current_odometer_read_at: string | null;
  current_odometer_source: PmOdometerSource | null;
  /** Why current_odometer is null (ABSENT), else null. */
  current_odometer_note: string | null;
  miles_since_service: number | null;
  miles_to_due: number | null;
  miles_per_day: number | null;
  projected_due_date: string | null;
  reason: string | null;
};

const TRAILING_WINDOW_DAYS = 90;
/** ROUND 303 T-37: a last_service_odometer this low is a placeholder, never a real baseline. */
const PLACEHOLDER_BASELINE_MAX_MILES = 1;

/**
 * The unit's own trailing-window mileage rate, from telematics.odometer_readings alone -- no
 * Samsara call. Only 'measured'/'entered' readings count toward the rate (never 'suggested',
 * which is J-1's own honest gap marker carrying no real value). A 'suggested' row anywhere in the
 * window means the rate spans a period we do not actually know the truck's mileage for, so the
 * whole window is refused rather than silently interpolated across the hole.
 */
export async function computeUnitMileageRate(
  client: DbClient,
  operatingCompanyId: string,
  unitId: string,
  windowDays: number = TRAILING_WINDOW_DAYS
): Promise<UnitMileageRate> {
  const gap = await client.query<{ n: string }>(
    `
      SELECT count(*) AS n
      FROM telematics.odometer_readings
      WHERE operating_company_id = $1::uuid
        AND unit_id = $2::uuid
        AND confidence = 'suggested'
        AND read_at >= now() - ($3 || ' days')::interval
    `,
    [operatingCompanyId, unitId, String(windowDays)]
  );
  if (Number(gap.rows[0]?.n ?? 0) > 0) {
    return { miles_per_day: null, reason: "odometer gap in the trailing 90-day window" };
  }

  const real = await client.query<{ odometer_miles: string; read_at: string }>(
    `
      SELECT odometer_miles::text, read_at::text
      FROM telematics.odometer_readings
      WHERE operating_company_id = $1::uuid
        AND unit_id = $2::uuid
        AND confidence IN ('measured', 'entered')
        AND odometer_miles IS NOT NULL
        AND read_at >= now() - ($3 || ' days')::interval
      ORDER BY read_at ASC
    `,
    [operatingCompanyId, unitId, String(windowDays)]
  );

  if (real.rows.length < 2) {
    return { miles_per_day: null, reason: "insufficient odometer history in the trailing 90-day window" };
  }

  const first = real.rows[0]!;
  const last = real.rows[real.rows.length - 1]!;
  const milesDelta = Number(last.odometer_miles) - Number(first.odometer_miles);
  const daysDelta = (new Date(last.read_at).getTime() - new Date(first.read_at).getTime()) / 86_400_000;

  if (!Number.isFinite(milesDelta) || !Number.isFinite(daysDelta) || daysDelta <= 0) {
    return { miles_per_day: null, reason: "insufficient odometer history in the trailing 90-day window" };
  }
  if (milesDelta <= 0) {
    return { miles_per_day: null, reason: "no positive mileage rate in the trailing 90-day window" };
  }

  return { miles_per_day: milesDelta / daysDelta, reason: null };
}

export async function computePmDueEngineForCompany(
  client: DbClient,
  operatingCompanyId: string
): Promise<PmDueEngineRow[]> {
  const schedules = await client.query<{
    id: string;
    unit_id: string;
    unit_number: string;
    label: string;
    interval_kind: "miles" | "hours" | "days";
    interval_value: number;
    last_service_odometer: number | null;
    next_due_odometer: number | null;
  }>(
    `
      SELECT
        s.id::text,
        s.unit_id::text,
        u.unit_number,
        s.label,
        s.interval_kind::text AS interval_kind,
        s.interval_value,
        s.last_service_odometer,
        s.next_due_odometer
      FROM maintenance.pm_schedules s
      JOIN mdata.units u
        ON u.id = s.unit_id
       AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = s.operating_company_id
       AND u.deactivated_at IS NULL
      WHERE s.operating_company_id = $1::uuid
        AND s.is_active = true
        -- ROUND 303 T-37: a sample/test unit's schedule is never a real PM due date, no exceptions.
        AND COALESCE(u.is_sample_data, false) = false
      ORDER BY u.unit_number, s.label
    `,
    [operatingCompanyId]
  );

  // E-15 (ORDERS 2026-10-01 row 2): the SAME odometer source as E-14 -- one loader, never a second.
  const unitIds = [...new Set(schedules.rows.map((r) => r.unit_id))];
  const { byUnit, stopEventsLive } = await loadPmOdometers(client, operatingCompanyId, unitIds);

  const out: PmDueEngineRow[] = [];
  const rateCache = new Map<string, UnitMileageRate>();

  for (const row of schedules.rows) {
    const odo = byUnit.get(row.unit_id) ?? null;
    const isMiles = row.interval_kind === "miles";
    const baselineAbsent = pmScheduleBaselineAbsentReason(row);

    let milesSince: number | null = null;
    let milesToDue: number | null = null;
    let rate: UnitMileageRate = { miles_per_day: null, reason: null };
    let projected: { projected_due_date: string | null; reason: string | null };

    if (!isMiles || baselineAbsent) {
      projected = { projected_due_date: null, reason: baselineAbsent };
    } else if (odo == null) {
      projected = { projected_due_date: null, reason: absentOdometerReason(stopEventsLive) };
    } else {
      if (!rateCache.has(row.unit_id)) {
        rateCache.set(row.unit_id, await computeUnitMileageRate(client, operatingCompanyId, row.unit_id));
      }
      rate = rateCache.get(row.unit_id)!;
      // ROUND 303 T-37: last_service_odometer <= 1 is a placeholder, never a baseline -- baselineAbsent
      // above already refused it; an explicit next_due_odometer wins over interval arithmetic.
      const dueAt =
        row.next_due_odometer != null
          ? Number(row.next_due_odometer)
          : Number(row.last_service_odometer) + row.interval_value;
      milesSince =
        row.last_service_odometer != null && Number(row.last_service_odometer) > PLACEHOLDER_BASELINE_MAX_MILES
          ? odo.odometer - Number(row.last_service_odometer)
          : null;
      milesToDue = dueAt - odo.odometer;
      projected = projectPmDueDateFromRate(milesToDue, rate.miles_per_day, rate.reason);
    }

    out.push({
      pm_schedule_id: row.id,
      unit_id: row.unit_id,
      unit_number: row.unit_number,
      label: row.label,
      interval_kind: row.interval_kind,
      interval_miles: isMiles ? row.interval_value : null,
      interval_days: row.interval_kind === "days" ? row.interval_value : null,
      last_service_odometer:
        row.last_service_odometer != null && Number(row.last_service_odometer) > PLACEHOLDER_BASELINE_MAX_MILES
          ? Number(row.last_service_odometer)
          : null,
      current_odometer: odo?.odometer ?? null,
      current_odometer_read_at: odo?.read_at ?? null,
      current_odometer_source: odo?.source ?? null,
      current_odometer_note: odo ? null : absentOdometerReason(stopEventsLive),
      miles_since_service: milesSince,
      miles_to_due: milesToDue,
      miles_per_day: rate.miles_per_day,
      projected_due_date: projected.projected_due_date,
      reason: projected.reason,
    });
  }

  return out;
}

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerPmDueEngineRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/pm-due-engine", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    await assertCompanyMembership(user.uuid, parsed.data.operating_company_id);
    const rows = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [parsed.data.operating_company_id]);
      return computePmDueEngineForCompany(client as DbClient, parsed.data.operating_company_id);
    });
    return { rows, computed_from: "telematics.unit_stop_events -> telematics.odometer_readings -> ABSENT", never: "fleet_average" };
  });
}
