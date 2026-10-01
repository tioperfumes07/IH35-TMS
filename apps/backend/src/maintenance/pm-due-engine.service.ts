/**
 * ROUND 301 T-29 -- PM DUE ENGINE, off the odometer ledger.
 *
 * Owner verbatim: "WE BUILT THE MAINTENANCE CATALOG ALREADY, AVERAGING 12K MILES PER MONTH THE
 * PM EVERY 25K MILES ... I BELIEVE TO SAVE SPACE, WE WOULD CALL SAMSARA ONLY 1 TIME A DAY FOR
 * THE MILEAGE ... ILL INPUT MILEAGE MANUALLY."
 *
 * Reads ONLY telematics.odometer_readings (the ledger the 03:00 CT snapshot cron already writes,
 * J-1/J-2 from Round 297.1) -- this file makes no Samsara API call of any kind, directly or
 * transitively. Manual odometer entries (source='manual') are a FIRST-CLASS input here, exactly
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
  interval_miles: number;
  last_service_odometer: number | null;
  current_odometer: number | null;
  current_odometer_read_at: string | null;
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

/**
 * The MOST RECENT row for this unit, regardless of confidence, decides everything: if the newest
 * thing this ledger knows about the truck is an honest "suggested" gap (J-1's own null-odometer
 * marker), that IS the current state -- unknown right now -- and silently falling back to an
 * older real number would be exactly the kind of guess the owner's own rule forbids. Only when
 * the latest row itself carries a real value is that value "current".
 */
async function currentOdometer(
  client: DbClient,
  operatingCompanyId: string,
  unitId: string
): Promise<{ odometer_miles: number | null; read_at: string | null }> {
  const res = await client.query<{ odometer_miles: string | null; read_at: string; confidence: string }>(
    `
      SELECT odometer_miles::text, read_at::text, confidence
      FROM telematics.odometer_readings
      WHERE operating_company_id = $1::uuid
        AND unit_id = $2::uuid
      ORDER BY read_at DESC
      LIMIT 1
    `,
    [operatingCompanyId, unitId]
  );
  const row = res.rows[0];
  if (!row || row.confidence === "suggested" || row.odometer_miles == null) {
    return { odometer_miles: null, read_at: row?.read_at ?? null };
  }
  return { odometer_miles: Number(row.odometer_miles), read_at: row.read_at };
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
    interval_value: number;
    last_service_odometer: number | null;
  }>(
    `
      SELECT
        s.id::text,
        s.unit_id::text,
        u.unit_number,
        s.label,
        s.interval_value,
        s.last_service_odometer
      FROM maintenance.pm_schedules s
      JOIN mdata.units u
        ON u.id = s.unit_id
       AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = s.operating_company_id
       AND u.deactivated_at IS NULL
      WHERE s.operating_company_id = $1::uuid
        AND s.is_active = true
        AND s.interval_kind = 'miles'
        -- ROUND 303 T-37: a sample/test unit's schedule is never a real PM due date, no exceptions.
        AND COALESCE(u.is_sample_data, false) = false
      ORDER BY u.unit_number, s.label
    `,
    [operatingCompanyId]
  );

  const out: PmDueEngineRow[] = [];
  const rateCache = new Map<string, UnitMileageRate>();
  const odoCache = new Map<string, { odometer_miles: number | null; read_at: string | null }>();

  for (const row of schedules.rows) {
    if (!rateCache.has(row.unit_id)) {
      rateCache.set(row.unit_id, await computeUnitMileageRate(client, operatingCompanyId, row.unit_id));
    }
    if (!odoCache.has(row.unit_id)) {
      odoCache.set(row.unit_id, await currentOdometer(client, operatingCompanyId, row.unit_id));
    }
    const rate = rateCache.get(row.unit_id)!;
    const odo = odoCache.get(row.unit_id)!;

    // ROUND 303 T-37: last_service_odometer <= 1 is a placeholder wearing a number, not a real
    // baseline (a truck's last PM was never genuinely done at mile 1) -- treated as ABSENT, the
    // same honest NULL+reason path as a genuinely-missing baseline, never a guessed due date.
    const lastService =
      row.last_service_odometer != null && row.last_service_odometer > PLACEHOLDER_BASELINE_MAX_MILES
        ? row.last_service_odometer
        : null;
    const milesSince =
      lastService != null && odo.odometer_miles != null ? odo.odometer_miles - lastService : null;
    const milesToDue = milesSince != null ? row.interval_value - milesSince : null;

    const projected = projectPmDueDateFromRate(milesToDue, rate.miles_per_day, rate.reason);

    out.push({
      pm_schedule_id: row.id,
      unit_id: row.unit_id,
      unit_number: row.unit_number,
      label: row.label,
      interval_miles: row.interval_value,
      last_service_odometer: lastService,
      current_odometer: odo.odometer_miles,
      current_odometer_read_at: odo.read_at,
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
    return { rows, computed_from: "telematics.odometer_readings", never: "fleet_average" };
  });
}
