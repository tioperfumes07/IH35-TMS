/** A19: Reefer hours separate tracking — log, specs, Samsara ingest, PM-hours integration (ARCHIVE-not-DELETE). */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { parseSamsaraVehiclePayload } from "../mdata/unit-aggregate.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  equipment_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  include_archived: z.coerce.boolean().optional().default(false),
});

const logCreateSchema = z.object({
  operating_company_id: z.string().uuid(),
  equipment_id: z.string().uuid(),
  hours_reading: z.number().min(0),
  recorded_at: z.string().datetime().optional(),
  notes: z.string().trim().max(1000).optional().default(""),
});

const specsUpsertSchema = z.object({
  operating_company_id: z.string().uuid(),
  equipment_id: z.string().uuid(),
  reefer_brand: z.string().trim().max(120).optional(),
  service_interval_hours: z.number().int().positive().optional(),
  last_service_hours: z.number().min(0).nullable().optional(),
  last_service_date: z.string().date().nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
});

const archiveSchema = z.object({
  operating_company_id: z.string().uuid(),
  archive_reason: z.string().trim().min(3).max(240).optional(),
});

export type ReeferHoursPmEvaluation = "due" | "near_due" | "current";

type DbClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export function reeferHoursSourceLabel(source: string) {
  switch (source) {
    case "samsara":
      return "Samsara";
    case "manual":
      return "Manual";
    default:
      return source;
  }
}

export function extractReeferEngineHours(rawPayload: unknown): number | null {
  const parsed = parseSamsaraVehiclePayload(rawPayload);
  return parsed.engine_hours;
}

export function evaluateReeferHoursPmDue(
  currentHours: number | null,
  lastServiceHours: number | null,
  intervalHours: number,
  lookaheadHours = 50
): ReeferHoursPmEvaluation {
  if (currentHours == null || lastServiceHours == null || intervalHours <= 0) return "current";
  const nextDue = lastServiceHours + intervalHours;
  if (currentHours >= nextDue) return "due";
  if (currentHours >= nextDue - lookaheadHours) return "near_due";
  return "current";
}

export function hoursUntilReeferService(
  currentHours: number | null,
  lastServiceHours: number | null,
  intervalHours: number
): number | null {
  if (currentHours == null || lastServiceHours == null || intervalHours <= 0) return null;
  const remaining = lastServiceHours + intervalHours - currentHours;
  return Math.max(0, Math.round(remaining * 10) / 10);
}

export function mapReeferHoursLogRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    operating_company_id: row.operating_company_id,
    equipment_id: row.equipment_id,
    hours_reading: Number(row.hours_reading ?? 0),
    source: row.source,
    source_label: reeferHoursSourceLabel(String(row.source ?? "")),
    recorded_at: row.recorded_at,
    notes: row.notes ?? "",
    samsara_event_id: row.samsara_event_id ?? null,
    archived_at: row.archived_at ?? null,
    created_at: row.created_at,
  };
}

export function mapReeferSpecsRow(row: Record<string, unknown>, currentHours: number | null = null) {
  const interval = Number(row.service_interval_hours ?? 2000);
  const lastService = row.last_service_hours == null ? null : Number(row.last_service_hours);
  const pmStatus = evaluateReeferHoursPmDue(currentHours, lastService, interval);
  const hoursUntil = hoursUntilReeferService(currentHours, lastService, interval);
  return {
    id: row.id,
    operating_company_id: row.operating_company_id,
    equipment_id: row.equipment_id,
    equipment_number: row.equipment_number ?? null,
    reefer_brand: row.reefer_brand ?? "",
    service_interval_hours: interval,
    last_service_hours: lastService,
    last_service_date: row.last_service_date ?? null,
    notes: row.notes ?? "",
    current_hours: currentHours,
    hours_until_service: hoursUntil,
    pm_status: pmStatus,
    archived_at: row.archived_at ?? null,
    updated_at: row.updated_at,
  };
}

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: DbClient) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
    return fn(client as DbClient);
  });
}

const LOG_SELECT = `
  SELECT
    l.id::text,
    l.operating_company_id::text,
    l.equipment_id::text,
    l.hours_reading,
    l.source,
    l.recorded_at::text,
    l.notes,
    l.samsara_event_id,
    l.archived_at::text,
    l.created_at::text
  FROM maintenance.reefer_hours_log l
`;

const SPECS_SELECT = `
  SELECT
    rs.id::text,
    rs.operating_company_id::text,
    rs.equipment_id::text,
    e.equipment_number,
    rs.reefer_brand,
    rs.service_interval_hours,
    rs.last_service_hours,
    rs.last_service_date::text,
    rs.notes,
    rs.archived_at::text,
    rs.updated_at::text
  FROM maintenance.reefer_specs rs
  JOIN mdata.equipment e ON e.id = rs.equipment_id
`;

async function fetchLatestHours(client: DbClient, equipmentId: string): Promise<number | null> {
  const res = await client.query(
    `${LOG_SELECT}
     WHERE l.equipment_id = $1 AND l.archived_at IS NULL
     ORDER BY l.recorded_at DESC, l.created_at DESC
     LIMIT 1`,
    [equipmentId]
  );
  const row = res.rows[0];
  if (!row) return null;
  return Number(row.hours_reading);
}

async function ensureReeferSpecs(
  client: DbClient,
  companyId: string,
  equipmentId: string
): Promise<Record<string, unknown>> {
  const existing = await client.query(`${SPECS_SELECT} WHERE rs.equipment_id = $1 AND rs.archived_at IS NULL LIMIT 1`, [
    equipmentId,
  ]);
  if (existing.rows[0]) return existing.rows[0];

  const eqRes = await client.query(
    `SELECT reefer_brand, reefer_service_interval_hours, reefer_last_service_hours, reefer_last_service_date::text
     FROM mdata.equipment WHERE id = $1 AND (
       owner_company_id = $2 OR currently_leased_to_company_id = $2
     ) LIMIT 1`,
    [equipmentId, companyId]
  );
  const eq = eqRes.rows[0] ?? {};
  const insert = await client.query(
    `INSERT INTO maintenance.reefer_specs (
      operating_company_id, equipment_id, reefer_brand, service_interval_hours,
      last_service_hours, last_service_date
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id::text`,
    [
      companyId,
      equipmentId,
      String(eq.reefer_brand ?? ""),
      Number(eq.reefer_service_interval_hours ?? 2000) || 2000,
      eq.reefer_last_service_hours ?? null,
      eq.reefer_last_service_date ?? null,
    ]
  );
  const fetched = await client.query(`${SPECS_SELECT} WHERE rs.id = $1`, [String(insert.rows[0]?.id)]);
  return fetched.rows[0] ?? {};
}

export async function appendReeferHoursLogEntry(
  client: DbClient,
  input: {
    operating_company_id: string;
    equipment_id: string;
    hours_reading: number;
    source: "samsara" | "manual";
    recorded_at?: string;
    notes?: string;
    samsara_event_id?: string | null;
    created_by_user_id?: string | null;
  }
): Promise<Record<string, unknown> | null> {
  const latest = await fetchLatestHours(client, input.equipment_id);
  if (latest != null && Math.abs(latest - input.hours_reading) < 0.01 && input.source === "samsara") {
    return null;
  }

  const res = await client.query(
    `INSERT INTO maintenance.reefer_hours_log (
      operating_company_id, equipment_id, hours_reading, source, recorded_at, notes,
      samsara_event_id, created_by_user_id
    ) VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()), $6, $7, $8)
    RETURNING id::text`,
    [
      input.operating_company_id,
      input.equipment_id,
      input.hours_reading,
      input.source,
      input.recorded_at ?? null,
      input.notes ?? "",
      input.samsara_event_id ?? null,
      input.created_by_user_id ?? null,
    ]
  );
  const id = String(res.rows[0]?.id ?? "");
  const fetched = await client.query(`${LOG_SELECT} WHERE l.id = $1`, [id]);
  return fetched.rows[0] ?? null;
}

export async function ingestReeferHoursFromSamsaraForCompany(
  client: DbClient,
  operatingCompanyId: string
): Promise<{ ingested: number; skipped: number }> {
  const res = await client.query(
    `
      SELECT DISTINCT ON (e.id)
        e.id::text AS equipment_id,
        sv.raw_payload,
        sv.samsara_vehicle_id
      FROM mdata.equipment e
      JOIN mdata.units u ON u.id = e.current_unit_id
      JOIN integrations.samsara_vehicles sv
        ON sv.local_unit_id = u.id
       AND sv.operating_company_id = $1::uuid
      WHERE e.equipment_type = 'Reefer'
        AND (e.owner_company_id = $1::uuid OR e.currently_leased_to_company_id = $1::uuid)
        AND e.deactivated_at IS NULL
      ORDER BY e.id, sv.last_seen_at DESC NULLS LAST
    `,
    [operatingCompanyId]
  );

  let ingested = 0;
  let skipped = 0;
  for (const row of res.rows) {
    const hours = extractReeferEngineHours(row.raw_payload);
    if (hours == null) {
      skipped += 1;
      continue;
    }
    await ensureReeferSpecs(client, operatingCompanyId, String(row.equipment_id));
    const inserted = await appendReeferHoursLogEntry(client, {
      operating_company_id: operatingCompanyId,
      equipment_id: String(row.equipment_id),
      hours_reading: hours,
      source: "samsara",
      samsara_event_id: row.samsara_vehicle_id ? String(row.samsara_vehicle_id) : null,
      notes: "Samsara ingest",
    });
    if (inserted) ingested += 1;
    else skipped += 1;
  }
  return { ingested, skipped };
}

export async function evaluateReeferHoursPmSchedulesForCompany(
  client: DbClient,
  operatingCompanyId: string
): Promise<Array<Record<string, unknown>>> {
  const res = await client.query(
    `
      SELECT
        ps.id::text AS pm_schedule_id,
        ps.label,
        ps.interval_value,
        ps.unit_id::text,
        u.unit_number,
        e.id::text AS equipment_id,
        e.equipment_number
      FROM maintenance.pm_schedules ps
      JOIN mdata.units u ON u.id = ps.unit_id
      LEFT JOIN mdata.equipment e ON e.current_unit_id = u.id AND e.equipment_type = 'Reefer'
      WHERE ps.operating_company_id = $1::uuid
        AND ps.is_active = true
        AND ps.interval_kind = 'hours'
    `,
    [operatingCompanyId]
  );

  const dueRows: Array<Record<string, unknown>> = [];
  for (const row of res.rows) {
    const equipmentId = row.equipment_id ? String(row.equipment_id) : null;
    if (!equipmentId) continue;
    const specs = await ensureReeferSpecs(client, operatingCompanyId, equipmentId);
    const currentHours = await fetchLatestHours(client, equipmentId);
    const mapped = mapReeferSpecsRow(specs, currentHours);
    if (mapped.pm_status === "due" || mapped.pm_status === "near_due") {
      dueRows.push({
        pm_schedule_id: row.pm_schedule_id,
        label: row.label,
        interval_hours: row.interval_value,
        unit_id: row.unit_id,
        unit_number: row.unit_number,
        equipment_id: equipmentId,
        equipment_number: row.equipment_number,
        current_hours: mapped.current_hours,
        hours_until_service: mapped.hours_until_service,
        pm_status: mapped.pm_status,
      });
    }
  }
  return dueRows;
}

export async function registerMaintenanceReeferHoursRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/reefer-hours/log", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(reply, parsed.error);

    const rows = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const filters = ["l.operating_company_id = $1"];
      const values: unknown[] = [parsed.data.operating_company_id];
      if (!parsed.data.include_archived) filters.push("l.archived_at IS NULL");
      if (parsed.data.equipment_id) {
        values.push(parsed.data.equipment_id);
        filters.push(`l.equipment_id = $${values.length}`);
      }
      values.push(parsed.data.limit);
      const res = await client.query(
        `${LOG_SELECT} WHERE ${filters.join(" AND ")} ORDER BY l.recorded_at DESC, l.created_at DESC LIMIT $${values.length}`,
        values
      );
      return res.rows.map(mapReeferHoursLogRow);
    });
    return reply.send({ rows });
  });

  app.post("/api/v1/maintenance/reefer-hours/log", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = logCreateSchema.safeParse(req.body);
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    const row = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      await ensureReeferSpecs(client, body.operating_company_id, body.equipment_id);
      const inserted = await appendReeferHoursLogEntry(client, {
        operating_company_id: body.operating_company_id,
        equipment_id: body.equipment_id,
        hours_reading: body.hours_reading,
        source: "manual",
        recorded_at: body.recorded_at,
        notes: body.notes,
        created_by_user_id: user.uuid,
      });
      await appendCrudAudit(client, user.uuid, "maintenance.reefer_hours.manual_entry", {
        equipment_id: body.equipment_id,
        hours_reading: body.hours_reading,
      });
      return inserted;
    });

    if (!row) return reply.code(409).send({ error: "duplicate_reading" });
    return reply.code(201).send(mapReeferHoursLogRow(row));
  });

  app.get("/api/v1/maintenance/reefer-hours/snapshot", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema
      .extend({ equipment_id: z.string().uuid() })
      .safeParse(req.query);
    if (!parsed.success) return validationError(reply, parsed.error);

    const payload = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const specs = await ensureReeferSpecs(client, parsed.data.operating_company_id, parsed.data.equipment_id);
      const currentHours = await fetchLatestHours(client, parsed.data.equipment_id);
      const logRes = await client.query(
        `${LOG_SELECT}
         WHERE l.equipment_id = $1 AND l.archived_at IS NULL
         ORDER BY l.recorded_at DESC, l.created_at DESC
         LIMIT $2`,
        [parsed.data.equipment_id, parsed.data.limit]
      );
      return {
        specs: mapReeferSpecsRow(specs, currentHours),
        history: logRes.rows.map(mapReeferHoursLogRow),
      };
    });
    return reply.send(payload);
  });

  app.put("/api/v1/maintenance/reefer-hours/specs", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = specsUpsertSchema.safeParse(req.body);
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    const row = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      await ensureReeferSpecs(client, body.operating_company_id, body.equipment_id);
      const sets: string[] = ["updated_at = now()"];
      const values: unknown[] = [];
      const add = (column: string, value: unknown) => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };
      if (body.reefer_brand !== undefined) add("reefer_brand", body.reefer_brand);
      if (body.service_interval_hours !== undefined) add("service_interval_hours", body.service_interval_hours);
      if (body.last_service_hours !== undefined) add("last_service_hours", body.last_service_hours);
      if (body.last_service_date !== undefined) add("last_service_date", body.last_service_date);
      if (body.notes !== undefined) add("notes", body.notes);

      values.push(body.equipment_id, body.operating_company_id);
      await client.query(
        `UPDATE maintenance.reefer_specs SET ${sets.join(", ")}
         WHERE equipment_id = $${values.length - 1} AND operating_company_id = $${values.length} AND archived_at IS NULL`,
        values
      );
      await appendCrudAudit(client, user.uuid, "maintenance.reefer_specs.updated", {
        equipment_id: body.equipment_id,
      });
      const specs = await client.query(`${SPECS_SELECT} WHERE rs.equipment_id = $1 AND rs.archived_at IS NULL LIMIT 1`, [
        body.equipment_id,
      ]);
      const currentHours = await fetchLatestHours(client, body.equipment_id);
      return mapReeferSpecsRow(specs.rows[0] ?? {}, currentHours);
    });
    return reply.send(row);
  });

  app.post("/api/v1/maintenance/reefer-hours/ingest-samsara", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const result = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const ingest = await ingestReeferHoursFromSamsaraForCompany(client, parsed.data.operating_company_id);
      await appendCrudAudit(client, user.uuid, "maintenance.reefer_hours.samsara_ingest", ingest);
      return ingest;
    });
    return reply.send(result);
  });

  app.get("/api/v1/maintenance/reefer-hours/pm-due", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(reply, parsed.error);

    const rows = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) =>
      evaluateReeferHoursPmSchedulesForCompany(client, parsed.data.operating_company_id)
    );
    return reply.send({ rows });
  });

  app.post("/api/v1/maintenance/reefer-hours/log/:id/archive", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    const parsed = archiveSchema.safeParse(req.body);
    if (!params.success || !parsed.success) {
      return validationError(reply, (params.success ? parsed.error : params.error) as z.ZodError);
    }

    await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      await client.query(
        `UPDATE maintenance.reefer_hours_log
         SET archived_at = now(), archive_reason = $3
         WHERE id = $1 AND operating_company_id = $2 AND archived_at IS NULL`,
        [params.data.id, parsed.data.operating_company_id, parsed.data.archive_reason ?? "Archived reefer hours entry"]
      );
      await appendCrudAudit(client, user.uuid, "maintenance.reefer_hours.archived", { id: params.data.id });
    });
    return reply.send({ ok: true, id: params.data.id });
  });
}
