import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { evaluatePmDue, extractSamsaraOdometerMi } from "./pm-due.shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

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
  live_odometer_mi: number | null;
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
  const filters = ["s.tenant_id = $1::uuid"];
  if (assetId) {
    values.push(assetId);
    filters.push(`s.asset_id = $${values.length}::uuid`);
  }
  const result = await client.query<PmScheduleRow>(
    `
      SELECT
        s.id::text,
        s.asset_id::text,
        a.unit_code,
        s.pm_type,
        s.interval_miles::int,
        s.interval_days::int,
        s.last_done_miles::int,
        s.last_done_date::text,
        s.next_due_miles::int,
        s.next_due_date::text,
        a.samsara_unit_id,
        sv.raw_payload AS samsara_raw_payload,
        vlp.odometer_mi::float8 AS live_odometer_mi
      FROM maint.pm_schedule s
      JOIN mdata.assets a ON a.id = s.asset_id AND a.tenant_id = s.tenant_id
      LEFT JOIN integrations.samsara_vehicles sv
        ON sv.operating_company_id = s.tenant_id
       AND sv.samsara_vehicle_id = a.samsara_unit_id
      -- Live odometer from the Samsara stats-poll ingest (#1289): the webhook raw_payload is empty
      -- because we POLL, not webhook, so the current odometer must come from telematics.vehicle_latest_position.
      LEFT JOIN telematics.vehicle_latest_position vlp
        ON vlp.operating_company_id = s.tenant_id
       AND vlp.samsara_vehicle_id = a.samsara_unit_id
      WHERE ${filters.join(" AND ")}
      ORDER BY COALESCE(s.next_due_date, DATE '9999-12-31') ASC, COALESCE(s.next_due_miles, 2147483647) ASC
    `,
    values
  );
  return result.rows;
}

function mapDueRow(row: PmScheduleRow) {
  // Prefer the live odometer ingested by the Samsara stats poll (#1289, vehicle_latest_position.odometer_mi);
  // fall back to the webhook raw_payload for any unit still on the webhook path.
  const currentOdometer =
    typeof row.live_odometer_mi === "number" && Number.isFinite(row.live_odometer_mi)
      ? Math.round(row.live_odometer_mi)
      : extractSamsaraOdometerMi(row.samsara_raw_payload);
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
// endpoints below are unaffected and keep serving `maint.pm_schedule` (a KNOWN_LEGACY read, not a write).
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
      return schedules.map(mapDueRow);
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
      const mapped = schedules.map(mapDueRow);
      return parsed.data.include_not_due ? mapped : mapped.filter((row) => row.is_due);
    });

    return { rows, computed_from: "live_odometer_and_schedule_dates" };
  });

  app.post("/api/v1/maint/pm/schedules", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (_req, reply) => {
    return reply.code(410).send(GONE_BODY);
  });

  app.patch("/api/v1/maint/pm/schedules/:id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (_req, reply) => {
    return reply.code(410).send(GONE_BODY);
  });
}
