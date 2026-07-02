import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  evaluatePmDue,
  extractSamsaraOdometerMi,
  recomputePmScheduleDueFields,
} from "./pm-due.shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const pmTypeSchema = z.enum([
  "oil",
  "tires",
  "dot_inspection",
  "brake",
  "transmission",
  "coolant",
  "other",
]);

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  asset_id: z.string().uuid().optional(),
  include_not_due: z.coerce.boolean().optional().default(false),
});

const createPmSchema = z.object({
  operating_company_id: z.string().uuid(),
  asset_id: z.string().uuid(),
  pm_type: pmTypeSchema,
  interval_miles: z.number().int().positive().optional(),
  interval_days: z.number().int().positive().optional(),
  last_done_miles: z.number().int().nonnegative().optional(),
  last_done_date: z.string().optional(),
});

const updatePmSchema = z
  .object({
    pm_type: pmTypeSchema.optional(),
    interval_miles: z.number().int().positive().nullable().optional(),
    interval_days: z.number().int().positive().nullable().optional(),
    last_done_miles: z.number().int().nonnegative().nullable().optional(),
    last_done_date: z.string().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

const idParamsSchema = z.object({ id: z.string().uuid() });

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

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Mechanic"].includes(role);
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
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

export async function registerMaintPmRoutes(app: FastifyInstance) {
  app.get("/api/v1/maint/pm/schedules", async (req, reply) => {
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

  app.get("/api/v1/maint/pm/due", async (req, reply) => {
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

  app.post("/api/v1/maint/pm/schedules", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = createPmSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const body = parsed.data;
    if (body.interval_miles == null && body.interval_days == null) {
      return reply.code(400).send({ error: "validation_error", message: "interval_miles or interval_days required" });
    }

    const dueFields = recomputePmScheduleDueFields({
      interval_miles: body.interval_miles ?? null,
      interval_days: body.interval_days ?? null,
      last_done_miles: body.last_done_miles ?? null,
      last_done_date: body.last_done_date ?? null,
    });

    const created = await withCompanyScope(user.uuid, body.operating_company_id, async (client) => {
      const result = await client.query(
        `
          INSERT INTO maint.pm_schedule (
            tenant_id,
            asset_id,
            pm_type,
            interval_miles,
            interval_days,
            last_done_miles,
            last_done_date,
            next_due_miles,
            next_due_date
          )
          VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::date, $8, $9::date)
          RETURNING id::text
        `,
        [
          body.operating_company_id,
          body.asset_id,
          body.pm_type,
          body.interval_miles ?? null,
          body.interval_days ?? null,
          body.last_done_miles ?? null,
          body.last_done_date ?? null,
          dueFields.next_due_miles,
          dueFields.next_due_date,
        ]
      );
      await appendCrudAudit(client, user.uuid, "maint.pm_schedule.created", {
        resource_id: result.rows[0]?.id,
        operating_company_id: body.operating_company_id,
      });
      return result.rows[0];
    });

    return reply.code(201).send(created);
  });

  app.patch("/api/v1/maint/pm/schedules/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const bodyParsed = updatePmSchema.safeParse(req.body ?? {});
    if (!bodyParsed.success) return reply.code(400).send({ error: "validation_error", details: bodyParsed.error.flatten() });
    const body = bodyParsed.data;

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const existing = await client.query<PmScheduleRow>(
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
            NULL::jsonb AS samsara_raw_payload
          FROM maint.pm_schedule s
          JOIN mdata.assets a ON a.id = s.asset_id AND a.tenant_id = s.tenant_id
          WHERE s.tenant_id = $1::uuid AND s.id = $2::uuid
          LIMIT 1
        `,
        [query.data.operating_company_id, params.data.id]
      );
      if (!existing.rows[0]) return null;

      const next = {
        pm_type: body.pm_type ?? existing.rows[0].pm_type,
        interval_miles: body.interval_miles !== undefined ? body.interval_miles : existing.rows[0].interval_miles,
        interval_days: body.interval_days !== undefined ? body.interval_days : existing.rows[0].interval_days,
        last_done_miles:
          body.last_done_miles !== undefined ? body.last_done_miles : existing.rows[0].last_done_miles,
        last_done_date: body.last_done_date !== undefined ? body.last_done_date : existing.rows[0].last_done_date,
      };
      const dueFields = recomputePmScheduleDueFields(next);

      const result = await client.query(
        `
          UPDATE maint.pm_schedule
          SET
            pm_type = $3,
            interval_miles = $4,
            interval_days = $5,
            last_done_miles = $6,
            last_done_date = $7::date,
            next_due_miles = $8,
            next_due_date = $9::date
          WHERE tenant_id = $1::uuid AND id = $2::uuid
          RETURNING id::text
        `,
        [
          query.data.operating_company_id,
          params.data.id,
          next.pm_type,
          next.interval_miles,
          next.interval_days,
          next.last_done_miles,
          next.last_done_date,
          dueFields.next_due_miles,
          dueFields.next_due_date,
        ]
      );
      await appendCrudAudit(client, user.uuid, "maint.pm_schedule.updated", {
        resource_id: params.data.id,
        operating_company_id: query.data.operating_company_id,
      });
      return result.rows[0];
    });

    if (!updated) return reply.code(404).send({ error: "pm_schedule_not_found" });
    return updated;
  });
}
