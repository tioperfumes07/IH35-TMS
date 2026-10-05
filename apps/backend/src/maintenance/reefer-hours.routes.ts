/** A19: Reefer hours separate tracking — log, specs, Samsara ingest, PM-hours integration (ARCHIVE-not-DELETE). */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { parseSamsaraVehiclePayload } from "../mdata/unit-aggregate.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { LOG_SELECT, SPECS_SELECT, appendReeferHoursLogEntry, ensureReeferSpecs, evaluateReeferHoursPmSchedulesForCompany, fetchLatestHours, ingestReeferHoursFromSamsaraForCompany, mapReeferHoursLogRow, mapReeferSpecsRow } from "./reefer-hours.service.js";
import type { DbClient } from "./reefer-hours.service.js";
export { appendReeferHoursLogEntry, evaluateReeferHoursPmDue, evaluateReeferHoursPmSchedulesForCompany, extractReeferEngineHours, hoursUntilReeferService, ingestReeferHoursFromSamsaraForCompany, mapReeferHoursLogRow, mapReeferSpecsRow, reeferHoursSourceLabel } from "./reefer-hours.service.js";
export type { ReeferHoursPmEvaluation } from "./reefer-hours.service.js";

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

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: DbClient) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    return fn(client as DbClient);
  });
}

export async function registerMaintenanceReeferHoursRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/reefer-hours/log", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(reply, parsed.error);

    const rows = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const filters = ["l.operating_company_id = $1::uuid"];
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

  app.post("/api/v1/maintenance/reefer-hours/log", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
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
        operating_company_id: body.operating_company_id,
        equipment_id: body.equipment_id,
        hours_reading: body.hours_reading,
      });
      return inserted;
    });

    if (!row) return reply.code(409).send({ error: "duplicate_reading" });
    return reply.code(201).send(mapReeferHoursLogRow(row));
  });

  app.get("/api/v1/maintenance/reefer-hours/snapshot", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema
      .extend({ equipment_id: z.string().uuid() })
      .safeParse(req.query);
    if (!parsed.success) return validationError(reply, parsed.error);

    const payload = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const specs = await ensureReeferSpecs(client, parsed.data.operating_company_id, parsed.data.equipment_id);
      const currentHours = await fetchLatestHours(client, parsed.data.operating_company_id, parsed.data.equipment_id);
      const logRes = await client.query(
        `${LOG_SELECT}
         WHERE l.equipment_id = $1 AND l.operating_company_id = $2::uuid AND l.archived_at IS NULL
         ORDER BY l.recorded_at DESC, l.created_at DESC
         LIMIT $3`,
        [parsed.data.equipment_id, parsed.data.operating_company_id, parsed.data.limit]
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
      const updated = await client.query(
        `UPDATE maintenance.reefer_specs SET ${sets.join(", ")}
         WHERE equipment_id = $${values.length - 1} AND operating_company_id = $${values.length}::uuid AND archived_at IS NULL
         RETURNING id::text`,
        values
      );
      if (!updated.rows[0]) return null;
      await appendCrudAudit(client, user.uuid, "maintenance.reefer_specs.updated", {
        operating_company_id: body.operating_company_id,
        equipment_id: body.equipment_id,
      });
      const specs = await client.query(
        `${SPECS_SELECT} WHERE rs.equipment_id = $1 AND rs.operating_company_id = $2::uuid AND rs.archived_at IS NULL LIMIT 1`,
        [body.equipment_id, body.operating_company_id]
      );
      const currentHours = await fetchLatestHours(client, body.operating_company_id, body.equipment_id);
      return mapReeferSpecsRow(specs.rows[0] ?? {}, currentHours);
    });
    if (!row) return reply.code(409).send({ error: "reefer_specs_changed_during_update" });
    return reply.send(row);
  });

  app.post("/api/v1/maintenance/reefer-hours/ingest-samsara", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const result = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const ingest = await ingestReeferHoursFromSamsaraForCompany(client, parsed.data.operating_company_id);
      await appendCrudAudit(client, user.uuid, "maintenance.reefer_hours.samsara_ingest", {
        operating_company_id: parsed.data.operating_company_id,
        ...ingest,
      });
      return ingest;
    });
    return reply.send(result);
  });

  app.get("/api/v1/maintenance/reefer-hours/pm-due", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(reply, parsed.error);

    const rows = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) =>
      evaluateReeferHoursPmSchedulesForCompany(client, parsed.data.operating_company_id)
    );
    return reply.send({ rows });
  });

  app.post("/api/v1/maintenance/reefer-hours/log/:id/archive", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    const parsed = archiveSchema.safeParse(req.body);
    if (!params.success || !parsed.success) {
      return validationError(reply, (params.success ? parsed.error : params.error) as z.ZodError);
    }

    const archived = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const result = await client.query(
        `UPDATE maintenance.reefer_hours_log
         SET archived_at = now(), archive_reason = $3
         WHERE id = $1 AND operating_company_id = $2::uuid AND archived_at IS NULL
         RETURNING id::text`,
        [params.data.id, parsed.data.operating_company_id, parsed.data.archive_reason ?? "Archived reefer hours entry"]
      );
      if (!result.rows[0]) return null;
      await appendCrudAudit(client, user.uuid, "maintenance.reefer_hours.archived", {
        operating_company_id: parsed.data.operating_company_id,
        id: params.data.id,
      });
      return result.rows[0];
    });
    if (!archived) return reply.code(404).send({ error: "reefer_hours_log_not_found_or_already_archived" });
    return reply.send({ ok: true, id: params.data.id });
  });
}
