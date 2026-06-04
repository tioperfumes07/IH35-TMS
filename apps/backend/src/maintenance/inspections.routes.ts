/** B30: maintenance.inspections CRUD + photos + DVIR linkage (ARCHIVE-not-DELETE). */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const INSPECTION_TYPES = ["annual_dot", "pre_trip", "post_trip", "custom"] as const;
const INSPECTION_STATUSES = ["scheduled", "in_progress", "completed", "archived"] as const;
const INSPECTION_OUTCOMES = ["pass", "fail", "pending"] as const;

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  include_archived: z.coerce.boolean().optional().default(false),
  unit_id: z.string().uuid().optional(),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  operating_company_id: z.string().uuid(),
  unit_id: z.string().uuid(),
  inspection_type: z.enum(INSPECTION_TYPES),
  status: z.enum(INSPECTION_STATUSES).optional().default("scheduled"),
  scheduled_date: z.string().date().optional(),
  inspection_date: z.string().date().optional(),
  inspector_name: z.string().trim().min(2).max(120).optional(),
  mileage: z.number().int().nonnegative().optional(),
  outcome: z.enum(INSPECTION_OUTCOMES).optional(),
  notes: z.string().trim().max(4000).optional().default(""),
  defects: z.array(z.string().trim().min(1).max(240)).optional().default([]),
  dvir_submission_id: z.string().uuid().optional(),
  is_ad_hoc: z.boolean().optional().default(false),
});

const patchSchema = createSchema
  .omit({ operating_company_id: true })
  .partial()
  .extend({ operating_company_id: z.string().uuid() })
  .refine((v) => Object.keys(v).filter((k) => k !== "operating_company_id").length > 0, {
    message: "at least one field is required",
  });

const archiveSchema = z.object({
  operating_company_id: z.string().uuid(),
  archive_reason: z.string().trim().min(3).max(240).optional(),
});

const attachPhotoSchema = z.object({
  operating_company_id: z.string().uuid(),
  docs_file_id: z.string().uuid(),
  caption: z.string().trim().max(500).optional(),
  sort_order: z.number().int().min(0).optional().default(0),
});

export function inspectionTypeLabel(type: string) {
  switch (type) {
    case "annual_dot":
      return "Annual DOT";
    case "pre_trip":
      return "Pre-trip";
    case "post_trip":
      return "Post-trip";
    default:
      return "Custom";
  }
}

export function mapInspectionRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    operating_company_id: row.operating_company_id,
    unit_id: row.unit_id,
    unit_number: row.unit_number ?? null,
    inspection_type: row.inspection_type,
    inspection_type_label: inspectionTypeLabel(String(row.inspection_type ?? "")),
    status: row.status,
    scheduled_date: row.scheduled_date ?? null,
    inspection_date: row.inspection_date ?? null,
    inspector_name: row.inspector_name ?? null,
    mileage: row.mileage ?? null,
    outcome: row.outcome ?? null,
    notes: row.notes ?? "",
    defects: row.defects ?? [],
    dvir_submission_id: row.dvir_submission_id ?? null,
    dvir_type: row.dvir_type ?? null,
    dvir_submitted_at: row.dvir_submitted_at ?? null,
    is_ad_hoc: row.is_ad_hoc ?? false,
    archived_at: row.archived_at ?? null,
    archive_reason: row.archive_reason ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    photo_count: row.photo_count ?? 0,
  };
}

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(
  userId: string,
  companyId: string,
  fn: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
    return fn(client);
  });
}

const INSPECTION_SELECT = `
  SELECT
    i.id::text,
    i.operating_company_id::text,
    i.unit_id::text,
    u.unit_number,
    i.inspection_type,
    i.status,
    i.scheduled_date::text,
    i.inspection_date::text,
    i.inspector_name,
    i.mileage,
    i.outcome,
    i.notes,
    i.defects,
    i.dvir_submission_id::text,
    ds.type AS dvir_type,
    ds.submitted_at::text AS dvir_submitted_at,
    i.is_ad_hoc,
    i.archived_at::text,
    i.archive_reason,
    i.created_at::text,
    i.updated_at::text,
    COALESCE(p.photo_count, 0)::int AS photo_count
  FROM maintenance.inspections i
  LEFT JOIN mdata.units u ON u.id = i.unit_id
  LEFT JOIN safety.dvir_submissions ds ON ds.id = i.dvir_submission_id
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS photo_count
    FROM maintenance.inspection_photos ip
    WHERE ip.inspection_id = i.id
  ) p ON true
`;

export async function registerMaintenanceInspectionsRoutes(app: FastifyInstance) {
  // ARCHIVE-not-DELETE Sunset: legacy dot inspection events read-only stub replaced by maintenance.inspections (B30).

  app.get("/api/v1/maintenance/inspections", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const rows = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const filters = ["i.operating_company_id = $1"];
      const values: unknown[] = [parsed.data.operating_company_id];
      if (!parsed.data.include_archived) {
        filters.push("i.archived_at IS NULL");
      }
      if (parsed.data.unit_id) {
        values.push(parsed.data.unit_id);
        filters.push(`i.unit_id = $${values.length}`);
      }
      const res = await client.query(
        `
          ${INSPECTION_SELECT}
          WHERE ${filters.join(" AND ")}
          ORDER BY COALESCE(i.inspection_date, i.scheduled_date) DESC NULLS LAST, i.created_at DESC
          LIMIT 200
        `,
        values
      );
      return res.rows.map(mapInspectionRow);
    });
    return { rows };
  });

  app.get("/api/v1/maintenance/inspections/:id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.pick({ operating_company_id: true }).safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          ${INSPECTION_SELECT}
          WHERE i.id = $1 AND i.operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const inspection = res.rows[0];
      if (!inspection) return null;

      const photosRes = await client.query(
        `
          SELECT
            ip.id::text,
            ip.docs_file_id::text,
            ip.caption,
            ip.sort_order,
            ip.created_at::text,
            f.original_filename,
            f.mime_type,
            f.upload_completed_at::text
          FROM maintenance.inspection_photos ip
          JOIN docs.files f ON f.id = ip.docs_file_id
          WHERE ip.inspection_id = $1
          ORDER BY ip.sort_order ASC, ip.created_at ASC
        `,
        [params.data.id]
      );
      return { inspection: mapInspectionRow(inspection), photos: photosRes.rows };
    });

    if (!payload) return reply.code(404).send({ error: "not_found" });
    return payload;
  });

  app.post("/api/v1/maintenance/inspections", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    const created = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      if (body.dvir_submission_id) {
        const dvirRes = await client.query(
          `SELECT id FROM safety.dvir_submissions WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
          [body.dvir_submission_id, body.operating_company_id]
        );
        if (!dvirRes.rows[0]) {
          throw Object.assign(new Error("dvir_not_found"), { code: "dvir_not_found" });
        }
      }

      const res = await client.query(
        `
          INSERT INTO maintenance.inspections (
            operating_company_id, unit_id, inspection_type, status, scheduled_date, inspection_date,
            inspector_name, mileage, outcome, notes, defects, dvir_submission_id, is_ad_hoc, created_by_user_id
          ) VALUES (
            $1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10, $11::text[], $12, $13, $14
          )
          RETURNING id::text
        `,
        [
          body.operating_company_id,
          body.unit_id,
          body.inspection_type,
          body.status,
          body.scheduled_date ?? null,
          body.inspection_date ?? null,
          body.inspector_name ?? null,
          body.mileage ?? null,
          body.outcome ?? null,
          body.notes,
          body.defects,
          body.dvir_submission_id ?? null,
          body.is_ad_hoc,
          user.uuid,
        ]
      );
      const id = res.rows[0]?.id;
      await appendCrudAudit(client, user.uuid, "maintenance.inspection.created", {
        resource_id: id,
        operating_company_id: body.operating_company_id,
        inspection_type: body.inspection_type,
        dvir_submission_id: body.dvir_submission_id ?? null,
      });
      const detail = await client.query(
        `${INSPECTION_SELECT} WHERE i.id = $1 LIMIT 1`,
        [id]
      );
      return mapInspectionRow(detail.rows[0] ?? { id });
    }).catch((err: Error & { code?: string }) => {
      if (err.code === "dvir_not_found") {
        reply.code(400).send({ error: "dvir_not_found" });
        return null;
      }
      throw err;
    });

    if (!created) return;
    return reply.code(201).send(created);
  });

  app.patch("/api/v1/maintenance/inspections/:id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const parsed = patchSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    const updated = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const existingRes = await client.query(
        `SELECT * FROM maintenance.inspections WHERE id = $1 AND operating_company_id = $2 AND archived_at IS NULL LIMIT 1`,
        [params.data.id, body.operating_company_id]
      );
      const existing = existingRes.rows[0];
      if (!existing) return null;

      if (body.dvir_submission_id) {
        const dvirRes = await client.query(
          `SELECT id FROM safety.dvir_submissions WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
          [body.dvir_submission_id, body.operating_company_id]
        );
        if (!dvirRes.rows[0]) throw Object.assign(new Error("dvir_not_found"), { code: "dvir_not_found" });
      }

      const fields: string[] = [];
      const values: unknown[] = [];
      const setField = (column: string, value: unknown) => {
        values.push(value);
        fields.push(`${column} = $${values.length}`);
      };

      if (body.unit_id != null) setField("unit_id", body.unit_id);
      if (body.inspection_type != null) setField("inspection_type", body.inspection_type);
      if (body.status != null) setField("status", body.status);
      if (body.scheduled_date !== undefined) setField("scheduled_date", body.scheduled_date);
      if (body.inspection_date !== undefined) setField("inspection_date", body.inspection_date);
      if (body.inspector_name !== undefined) setField("inspector_name", body.inspector_name);
      if (body.mileage !== undefined) setField("mileage", body.mileage);
      if (body.outcome !== undefined) setField("outcome", body.outcome);
      if (body.notes !== undefined) setField("notes", body.notes);
      if (body.defects !== undefined) setField("defects", body.defects);
      if (body.dvir_submission_id !== undefined) setField("dvir_submission_id", body.dvir_submission_id);
      if (body.is_ad_hoc !== undefined) setField("is_ad_hoc", body.is_ad_hoc);

      values.push(params.data.id, body.operating_company_id);
      await client.query(
        `
          UPDATE maintenance.inspections
          SET ${fields.join(", ")}, updated_at = now()
          WHERE id = $${values.length - 1} AND operating_company_id = $${values.length}
        `,
        values
      );

      const detail = await client.query(`${INSPECTION_SELECT} WHERE i.id = $1 LIMIT 1`, [params.data.id]);
      const updatedRow = detail.rows[0] ?? existing;

      await appendCrudAudit(client, user.uuid, "maintenance.inspection.updated", {
        resource_id: params.data.id,
        operating_company_id: body.operating_company_id,
        changes: buildPatchChanges(body as Record<string, unknown>, existing, updatedRow),
      });

      return mapInspectionRow(updatedRow);
    }).catch((err: Error & { code?: string }) => {
      if (err.code === "dvir_not_found") {
        reply.code(400).send({ error: "dvir_not_found" });
        return null;
      }
      throw err;
    });

    if (updated === null) return reply.code(404).send({ error: "not_found" });
    return updated;
  });

  app.post("/api/v1/maintenance/inspections/:id/archive", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const parsed = archiveSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const archived = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE maintenance.inspections
          SET status = 'archived', archived_at = now(), archive_reason = $3, updated_at = now()
          WHERE id = $1 AND operating_company_id = $2 AND archived_at IS NULL
          RETURNING id::text
        `,
        [params.data.id, parsed.data.operating_company_id, parsed.data.archive_reason ?? "Archived by user"]
      );
      if (!res.rows[0]) return null;
      await appendCrudAudit(client, user.uuid, "maintenance.inspection.archived", {
        resource_id: params.data.id,
        operating_company_id: parsed.data.operating_company_id,
        archive_reason: parsed.data.archive_reason ?? "Archived by user",
      });
      return { ok: true, id: res.rows[0].id };
    });

    if (!archived) return reply.code(404).send({ error: "not_found" });
    return archived;
  });

  app.post("/api/v1/maintenance/inspections/:id/photos", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const parsed = attachPhotoSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const photo = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const inspectionRes = await client.query(
        `SELECT id FROM maintenance.inspections WHERE id = $1 AND operating_company_id = $2 AND archived_at IS NULL LIMIT 1`,
        [params.data.id, parsed.data.operating_company_id]
      );
      if (!inspectionRes.rows[0]) return null;

      const fileRes = await client.query(
        `SELECT id FROM docs.files WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
        [parsed.data.docs_file_id, parsed.data.operating_company_id]
      );
      if (!fileRes.rows[0]) throw Object.assign(new Error("docs_file_not_found"), { code: "docs_file_not_found" });

      const res = await client.query(
        `
          INSERT INTO maintenance.inspection_photos (
            operating_company_id, inspection_id, docs_file_id, caption, sort_order
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING id::text, docs_file_id::text, caption, sort_order, created_at::text
        `,
        [
          parsed.data.operating_company_id,
          params.data.id,
          parsed.data.docs_file_id,
          parsed.data.caption ?? null,
          parsed.data.sort_order,
        ]
      );

      await appendCrudAudit(client, user.uuid, "maintenance.inspection.photo_attached", {
        resource_id: params.data.id,
        operating_company_id: parsed.data.operating_company_id,
        docs_file_id: parsed.data.docs_file_id,
      });

      return res.rows[0];
    }).catch((err: Error & { code?: string }) => {
      if (err.code === "docs_file_not_found") {
        reply.code(400).send({ error: "docs_file_not_found" });
        return null;
      }
      throw err;
    });

    if (photo === null) return reply.code(404).send({ error: "not_found" });
    return reply.code(201).send({ photo });
  });
}
