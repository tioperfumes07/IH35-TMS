import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { evaluatePmDue } from "./pm-due.shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { absentOdometerReason, loadPmOdometers, type PmOdometer } from "../maintenance/pm-current-odometer.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  asset_id: z.string().uuid().optional(),
  include_not_due: z.coerce.boolean().optional().default(false),
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

type PmScheduleRow = {
  id: string;
  asset_id: string;
  unit_code: string;
  pm_type: string;
  interval_miles: number | null;
  interval_days: number | null;
  last_done_miles: number | null;
  last_done_date: string | null;
  next_due_miles: number | null;
  next_due_date: string | null;
  samsara_unit_id: string | null;
  samsara_raw_payload: unknown;
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

async function listSchedules(client: Queryable, operatingCompanyId: string, assetId?: string) {
  const values: unknown[] = [operatingCompanyId];
  const filters = ["s.operating_company_id = $1::uuid", "s.is_active = true"];
  if (assetId) {
    values.push(assetId);
    filters.push(`s.unit_id = $${values.length}::uuid`);
  }
  const result = await client.query<PmScheduleRow>(
    `
      SELECT
        s.id::text,
        s.unit_id::text AS asset_id,
        u.unit_number AS unit_code,
        CASE
          WHEN LOWER(s.label) LIKE '%oil%' THEN 'oil'
          WHEN LOWER(s.label) LIKE '%tire%' OR LOWER(s.label) LIKE '%tyre%' THEN 'tires'
          WHEN LOWER(s.label) LIKE '%dot%' THEN 'dot_inspection'
          WHEN LOWER(s.label) LIKE '%brake%' THEN 'brake'
          ELSE LOWER(REPLACE(BTRIM(s.label), ' ', '_'))
        END AS pm_type,
        CASE WHEN s.interval_kind = 'miles' THEN s.interval_value END::int AS interval_miles,
        CASE WHEN s.interval_kind = 'days' THEN s.interval_value END::int AS interval_days,
        s.last_service_odometer::int AS last_done_miles,
        NULL::text AS last_done_date,
        s.next_due_odometer::int AS next_due_miles,
        NULL::text AS next_due_date,
        COALESCE(sv.samsara_vehicle_id, u.samsara_vehicle_id) AS samsara_vehicle_id,
        sv.raw_payload AS samsara_raw_payload
      FROM maintenance.pm_schedules s
      JOIN mdata.units u
        ON u.id = s.unit_id
       AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = s.operating_company_id
       AND u.deactivated_at IS NULL
       AND COALESCE(u.is_sample_data, false) = false
      LEFT JOIN LATERAL (
        -- E-01 / T122: mirror-first. integrations.samsara_vehicles.local_unit_id is the live link;
        -- mdata.units.samsara_vehicle_id is only the fallback (T122 carries a 2024 id there).
        SELECT sv0.raw_payload, sv0.samsara_vehicle_id FROM integrations.samsara_vehicles sv0
         WHERE sv0.operating_company_id = s.operating_company_id
           AND (sv0.local_unit_id = u.id OR (sv0.local_unit_id IS NULL AND sv0.samsara_vehicle_id = u.samsara_vehicle_id))
         ORDER BY (sv0.local_unit_id = u.id) DESC NULLS LAST, sv0.last_seen_at DESC NULLS LAST
         LIMIT 1
      ) sv ON true
      WHERE ${filters.join(" AND ")}
      ORDER BY COALESCE(s.next_due_odometer, 2147483647) ASC, s.created_at DESC
    `,
    values
  );
  return result.rows;
}

/**
 * E-15 (ORDERS 2026-10-01 row 2): the SAME odometer source as the E-14 cron and the PM due engine --
 * telematics.unit_stop_events -> telematics.odometer_readings -> ABSENT, from one shared loader.
 * C-21 stays honest: an absent odometer is null with a reason, never a confident zero.
 */
function mapDueRow(row: PmScheduleRow, odo: PmOdometer | null, stopEventsLive: boolean) {
  const currentOdometer = odo ? Math.round(odo.odometer) : null;
  const evaluation = evaluatePmDue(
    {
      interval_miles: row.interval_miles,
      interval_days: row.interval_days,
      last_done_miles: row.last_done_miles,
      last_done_date: row.last_done_date,
      next_due_miles: row.next_due_miles,
      next_due_date: row.next_due_date,
    },
    currentOdometer
  );

  return {
    id: row.id,
    asset_id: row.asset_id,
    unit_code: row.unit_code,
    pm_type: row.pm_type,
    interval_miles: row.interval_miles,
    interval_days: row.interval_days,
    last_done_miles: row.last_done_miles,
    last_done_date: row.last_done_date,
    odometer_reading_at: odo?.read_at ?? null,
    odometer_source: odo?.source ?? null,
    odometer_note: odo ? null : absentOdometerReason(stopEventsLive),
    ...evaluation,
  };
}

// SWEEP-C2 (2026-09-02): the write endpoints below (POST/PATCH) used to INSERT/UPDATE the RETIRE-class
// `maint.pm_schedule` table directly — a confirmed live writer per verify-no-retire-table-writes.mjs
// KNOWN_LEGACY + scripts/verify-sweep-c2-no-retire-writes.baseline.json. The canonical PM-schedule create/
// update surface is maintenance.pm_schedules (apps/backend/src/maintenance/pm-schedule.routes.ts, mounted
// and used by the frontend today); its column shape has diverged materially from maint.pm_schedule (no
// 1:1 field mapping), so this is a genuine "already superseded by a different, non-isomorphic design," not
// a same-shape repoint. No frontend caller ever hit POST/PATCH on this legacy `/api/v1/maint/pm/schedules`
// path (apps/frontend/src/api/maintenance.ts only calls the GET `listMaintPmDue`); these were dead write
// endpoints. Root-cause fix: retire the writes (410 Gone, canonical location named) — the GET read
// endpoints below now read the same canonical table. Keeping a legacy read here made the R&M KPI count
// `maintenance.pm_alerts` while PM Countdown read an empty retired table, so one screen simultaneously
// reported "PM Due: 1" and "No active schedule".
const GONE_BODY = {
  error: "gone",
  message:
    "This write endpoint has been retired. maint.pm_schedule is read-only going forward; create/update PM schedules via /api/v1/maintenance/pm-schedules.",
  canonical: "/api/v1/maintenance/pm-schedules",
} as const;

export async function registerMaintPmRoutes(app: FastifyInstance) {
  app.get("/api/v1/maint/pm/schedules", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const schedules = await listSchedules(client, parsed.data.operating_company_id, parsed.data.asset_id);
      const odo = await loadPmOdometers(client, parsed.data.operating_company_id, [...new Set(schedules.map((r) => r.asset_id))]);
      return schedules.map((row) => mapDueRow(row, odo.byUnit.get(row.asset_id) ?? null, odo.stopEventsLive));
    });
    return { rows };
  });

  app.get("/api/v1/maint/pm/due", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const schedules = await listSchedules(client, parsed.data.operating_company_id, parsed.data.asset_id);
      const odo = await loadPmOdometers(client, parsed.data.operating_company_id, [...new Set(schedules.map((r) => r.asset_id))]);
      const mapped = schedules.map((row) => mapDueRow(row, odo.byUnit.get(row.asset_id) ?? null, odo.stopEventsLive));
      return parsed.data.include_not_due ? mapped : mapped.filter((row) => row.is_due);
    });

    return { rows, computed_from: "unit_stop_events -> odometer_readings -> ABSENT, schedule dates" };
  });

  app.post("/api/v1/maint/pm/schedules", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (_req, reply) => {
    return reply.code(410).send(GONE_BODY);
  });

  app.patch("/api/v1/maint/pm/schedules/:id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (_req, reply) => {
    return reply.code(410).send(GONE_BODY);
  });
}
