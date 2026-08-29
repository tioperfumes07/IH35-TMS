/** B32: Tire program — per-position records, rotation/replacement history, tread depth alerts (ARCHIVE-not-DELETE). */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

export const TRACTOR_POSITIONS = [
  { code: "STEER-LF", group: "steer", label: "Steer Left Front" },
  { code: "STEER-RF", group: "steer", label: "Steer Right Front" },
  { code: "DRIVE-LF1", group: "drive", label: "Drive Left Front 1" },
  { code: "DRIVE-LF2", group: "drive", label: "Drive Left Front 2" },
  { code: "DRIVE-LR1", group: "drive", label: "Drive Left Rear 1" },
  { code: "DRIVE-LR2", group: "drive", label: "Drive Left Rear 2" },
  { code: "DRIVE-RF1", group: "drive", label: "Drive Right Front 1" },
  { code: "DRIVE-RF2", group: "drive", label: "Drive Right Front 2" },
  { code: "DRIVE-RR1", group: "drive", label: "Drive Right Rear 1" },
  { code: "DRIVE-RR2", group: "drive", label: "Drive Right Rear 2" },
] as const;

export const TRAILER_POSITIONS = [
  { code: "TRAILER-L1", group: "trailer", label: "Trailer Left 1" },
  { code: "TRAILER-L2", group: "trailer", label: "Trailer Left 2" },
  { code: "TRAILER-R1", group: "trailer", label: "Trailer Right 1" },
  { code: "TRAILER-R2", group: "trailer", label: "Trailer Right 2" },
  { code: "TRAILER-AXLE-L", group: "trailer", label: "Trailer Axle Left" },
  { code: "TRAILER-AXLE-R", group: "trailer", label: "Trailer Axle Right" },
] as const;

const POSITION_BY_CODE = new Map<string, { code: string; group: "steer" | "drive" | "trailer"; label: string }>(
  [...TRACTOR_POSITIONS, ...TRAILER_POSITIONS].map((p) => [p.code, p] as const)
);

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  unit_id: z.string().uuid().optional(),
  equipment_id: z.string().uuid().optional(),
  include_archived: z.coerce.boolean().optional().default(false),
  tire_record_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

const brandCreateSchema = z.object({
  operating_company_id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  manufacturer: z.string().trim().max(120).optional().default(""),
  tread_warranty_32nds: z.number().int().positive().optional(),
  sort_order: z.number().int().min(0).optional().default(100),
});

const recordCreateSchema = z
  .object({
    operating_company_id: z.string().uuid(),
    unit_id: z.string().uuid().optional(),
    equipment_id: z.string().uuid().optional(),
    position_code: z.string().trim().min(3).max(40),
    brand_id: z.string().uuid().optional(),
    brand_name: z.string().trim().max(120).optional().default(""),
    serial_number: z.string().trim().max(80).optional().default(""),
    size: z.string().trim().max(40).optional().default(""),
    tread_depth_32nds: z.number().min(0).max(40).optional().default(32),
    tread_low_threshold_32nds: z.number().min(0).max(40).optional().default(4),
    installed_at: z.string().date().optional(),
    work_order_id: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.unit_id) !== Boolean(v.equipment_id), {
    message: "exactly one of unit_id or equipment_id is required",
  });

const recordPatchSchema = z
  .object({
    operating_company_id: z.string().uuid(),
    brand_id: z.string().uuid().nullable().optional(),
    brand_name: z.string().trim().max(120).optional(),
    serial_number: z.string().trim().max(80).optional(),
    size: z.string().trim().max(40).optional(),
    tread_depth_32nds: z.number().min(0).max(40).optional(),
    tread_low_threshold_32nds: z.number().min(0).max(40).optional(),
    installed_at: z.string().date().optional(),
    work_order_id: z.string().uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).filter((k) => k !== "operating_company_id").length > 0, {
    message: "at least one field is required",
  });

const archiveSchema = z.object({
  operating_company_id: z.string().uuid(),
  archive_reason: z.string().trim().min(3).max(240).optional(),
});

const rotateSchema = z.object({
  operating_company_id: z.string().uuid(),
  tire_record_id: z.string().uuid(),
  to_position_code: z.string().trim().min(3).max(40),
  notes: z.string().trim().max(1000).optional().default(""),
  work_order_id: z.string().uuid().optional(),
});

const replaceSchema = z.object({
  operating_company_id: z.string().uuid(),
  tire_record_id: z.string().uuid(),
  brand_id: z.string().uuid().optional(),
  brand_name: z.string().trim().max(120).optional().default(""),
  serial_number: z.string().trim().max(80).optional().default(""),
  size: z.string().trim().max(40).optional().default(""),
  tread_depth_32nds: z.number().min(0).max(40).optional().default(32),
  tread_low_threshold_32nds: z.number().min(0).max(40).optional().default(4),
  installed_at: z.string().date().optional(),
  notes: z.string().trim().max(1000).optional().default(""),
  work_order_id: z.string().uuid().optional(),
});

const treadAuditSchema = z.object({
  operating_company_id: z.string().uuid(),
  tire_record_id: z.string().uuid(),
  tread_depth_32nds: z.number().min(0).max(40),
  notes: z.string().trim().max(1000).optional().default(""),
});

export function tireEventTypeLabel(type: string) {
  switch (type) {
    case "rotation":
      return "Rotation";
    case "replacement":
      return "Replacement";
    case "tread_audit":
      return "Tread audit";
    default:
      return type;
  }
}

export function isLowTread(treadDepth: number, threshold: number) {
  return treadDepth <= threshold;
}

export function positionGroupForCode(code: string) {
  return POSITION_BY_CODE.get(code)?.group ?? null;
}

export function mapTireRecordRow(row: Record<string, unknown>) {
  const tread = Number(row.tread_depth_32nds ?? 32);
  const threshold = Number(row.tread_low_threshold_32nds ?? 4);
  return {
    id: row.id,
    operating_company_id: row.operating_company_id,
    unit_id: row.unit_id ?? null,
    equipment_id: row.equipment_id ?? null,
    unit_number: row.unit_number ?? null,
    equipment_number: row.equipment_number ?? null,
    position_code: row.position_code,
    position_group: row.position_group,
    position_label: POSITION_BY_CODE.get(String(row.position_code ?? ""))?.label ?? row.position_code,
    brand_id: row.brand_id ?? null,
    brand_name: row.brand_name ?? "",
    serial_number: row.serial_number ?? "",
    size: row.size ?? "",
    tread_depth_32nds: tread,
    tread_low_threshold_32nds: threshold,
    is_low_tread: isLowTread(tread, threshold),
    installed_at: row.installed_at ?? null,
    status: row.status,
    work_order_id: row.work_order_id ?? null,
    archived_at: row.archived_at ?? null,
    archive_reason: row.archive_reason ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function mapTireEventRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    tire_record_id: row.tire_record_id,
    event_type: row.event_type,
    event_type_label: tireEventTypeLabel(String(row.event_type ?? "")),
    from_position_code: row.from_position_code ?? null,
    to_position_code: row.to_position_code ?? null,
    tread_depth_32nds: row.tread_depth_32nds ?? null,
    brand_id: row.brand_id ?? null,
    brand_name: row.brand_name ?? "",
    serial_number: row.serial_number ?? "",
    notes: row.notes ?? "",
    is_low_tread_alert: row.is_low_tread_alert ?? false,
    work_order_id: row.work_order_id ?? null,
    created_at: row.created_at,
  };
}

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
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
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    return fn(client);
  });
}

const RECORD_SELECT = `
  SELECT
    tr.id::text,
    tr.operating_company_id::text,
    tr.unit_id::text,
    tr.equipment_id::text,
    u.unit_number,
    e.equipment_number,
    tr.position_code,
    tr.position_group,
    tr.brand_id::text,
    tr.brand_name,
    tr.serial_number,
    tr.size,
    tr.tread_depth_32nds,
    tr.tread_low_threshold_32nds,
    tr.installed_at::text,
    tr.status,
    tr.work_order_id::text,
    tr.archived_at,
    tr.archive_reason,
    tr.created_at,
    tr.updated_at
  FROM maintenance.tire_records tr
  -- CLS-JOIN-ENTITY-UNSCOPED: scoping the DRIVING row does not scope the joined row. tr is
  -- filtered by tr.operating_company_id at every call site, but a LEFT JOIN on a bare id would happily
  -- attach ANOTHER entity's unit/equipment and render its number as an authoritative label, with no
  -- error and no empty result to notice. §4 landmine: mdata.units and mdata.equipment have NO
  -- operating_company_id — the scope is COALESCE(currently_leased_to_company_id, owner_company_id).
  LEFT JOIN mdata.units u ON u.id = tr.unit_id
                         AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = tr.operating_company_id
  LEFT JOIN mdata.equipment e ON e.id = tr.equipment_id
                             AND COALESCE(e.currently_leased_to_company_id, e.owner_company_id) = tr.operating_company_id
`;

async function resolveBrandName(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  companyId: string,
  brandId?: string,
  fallback = ""
) {
  if (!brandId) return fallback;
  const res = await client.query(
    `SELECT name FROM maintenance.tire_brands WHERE id = $1 AND operating_company_id = $2::uuid AND archived_at IS NULL`,
    [brandId, companyId]
  );
  return String(res.rows[0]?.name ?? fallback);
}

async function fetchRecordById(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  companyId: string,
  id: string
) {
  const res = await client.query(`${RECORD_SELECT} WHERE tr.id = $1 AND tr.operating_company_id = $2::uuid`, [id, companyId]);
  return res.rows[0] ?? null;
}

async function assetBelongsToCompany(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  companyId: string,
  unitId?: string,
  equipmentId?: string,
) {
  const result = unitId
    ? await client.query(
        `SELECT id FROM mdata.units
          WHERE id = $1::uuid
            AND COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid
            AND deactivated_at IS NULL LIMIT 1`,
        [unitId, companyId],
      )
    : await client.query(
        `SELECT id FROM mdata.equipment
          WHERE id = $1::uuid
            AND COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid
            AND deactivated_at IS NULL LIMIT 1`,
        [equipmentId, companyId],
      );
  return Boolean(result.rows[0]);
}

async function workOrderBelongsToCompany(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  companyId: string,
  workOrderId?: string | null,
) {
  if (!workOrderId) return true;
  const result = await client.query(
    `SELECT id
       FROM maintenance.work_orders
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND voided_at IS NULL
      LIMIT 1`,
    [workOrderId, companyId],
  );
  return Boolean(result.rows[0]);
}

export async function registerMaintenanceTiresRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/tires/brands", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(reply, parsed.error);

    const rows = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT id::text, name, manufacturer, tread_warranty_32nds, is_active, sort_order
         FROM maintenance.tire_brands
         WHERE operating_company_id = $1::uuid AND archived_at IS NULL
         ORDER BY sort_order, name`,
        [parsed.data.operating_company_id]
      );
      return res.rows;
    });
    return reply.send({ rows });
  });

  app.post("/api/v1/maintenance/tires/brands", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = brandCreateSchema.safeParse(req.body);
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    const row = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const res = await client.query(
        `INSERT INTO maintenance.tire_brands (
          operating_company_id, name, manufacturer, tread_warranty_32nds, sort_order
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id::text, name, manufacturer, tread_warranty_32nds, is_active, sort_order`,
        [body.operating_company_id, body.name, body.manufacturer, body.tread_warranty_32nds ?? null, body.sort_order]
      );
      const createdBrand = res.rows[0];
      if (!createdBrand?.id) throw new Error("tire_brand_insert_returned_no_row");
      await appendCrudAudit(client, user.uuid, "maintenance.tire_brand.created", {
        operating_company_id: body.operating_company_id,
        name: body.name,
        manufacturer: body.manufacturer,
      });
      return createdBrand;
    });
    return reply.code(201).send(row);
  });

  app.get("/api/v1/maintenance/tires/layout", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(reply, parsed.error);
    if (!parsed.data.unit_id && !parsed.data.equipment_id) {
      return reply.code(400).send({ error: "unit_id or equipment_id required" });
    }

    const positions = parsed.data.equipment_id ? TRAILER_POSITIONS : TRACTOR_POSITIONS;
    const payload = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const filters = ["tr.operating_company_id = $1::uuid", "tr.status = 'active'"];
      const values: unknown[] = [parsed.data.operating_company_id];
      if (parsed.data.unit_id) {
        values.push(parsed.data.unit_id);
        filters.push(`tr.unit_id = $${values.length}`);
      } else {
        values.push(parsed.data.equipment_id);
        filters.push(`tr.equipment_id = $${values.length}`);
      }
      const res = await client.query(`${RECORD_SELECT} WHERE ${filters.join(" AND ")}`, values);
      const byPosition = new Map(res.rows.map((row) => [String(row.position_code), mapTireRecordRow(row)]));
      return {
        positions: positions.map((p) => ({
          ...p,
          record: byPosition.get(p.code) ?? null,
        })),
      };
    });
    return reply.send(payload);
  });

  app.get("/api/v1/maintenance/tires/records", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(reply, parsed.error);

    const rows = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const filters = ["tr.operating_company_id = $1::uuid"];
      const values: unknown[] = [parsed.data.operating_company_id];
      if (!parsed.data.include_archived) filters.push("tr.status = 'active'");
      if (parsed.data.unit_id) {
        values.push(parsed.data.unit_id);
        filters.push(`tr.unit_id = $${values.length}`);
      }
      if (parsed.data.equipment_id) {
        values.push(parsed.data.equipment_id);
        filters.push(`tr.equipment_id = $${values.length}`);
      }
      const res = await client.query(
        `${RECORD_SELECT} WHERE ${filters.join(" AND ")} ORDER BY tr.position_group, tr.position_code`,
        values
      );
      return res.rows.map(mapTireRecordRow);
    });
    return reply.send({ rows });
  });

  app.post("/api/v1/maintenance/tires/records", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = recordCreateSchema.safeParse(req.body);
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;
    const group = positionGroupForCode(body.position_code);
    if (!group) return reply.code(400).send({ error: "invalid_position_code" });
    if ((body.equipment_id && group !== "trailer") || (body.unit_id && group === "trailer")) {
      return reply.code(400).send({ error: "position_asset_mismatch" });
    }

    const row = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      if (!(await assetBelongsToCompany(client, body.operating_company_id, body.unit_id, body.equipment_id))) {
        return { __error: "linked_entity_not_in_operating_company" as const };
      }
      if (!(await workOrderBelongsToCompany(client, body.operating_company_id, body.work_order_id))) {
        return { __error: "work_order_not_in_operating_company" as const };
      }
      const brandName = await resolveBrandName(client, body.operating_company_id, body.brand_id, body.brand_name);
      const res = await client.query(
        `INSERT INTO maintenance.tire_records (
          operating_company_id, unit_id, equipment_id, position_code, position_group,
          brand_id, brand_name, serial_number, size, tread_depth_32nds, tread_low_threshold_32nds,
          installed_at, work_order_id, created_by_user_id
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, $11,
          COALESCE($12::date, CURRENT_DATE), $13, $14
        )
        RETURNING id`,
        [
          body.operating_company_id,
          body.unit_id ?? null,
          body.equipment_id ?? null,
          body.position_code,
          group,
          body.brand_id ?? null,
          brandName,
          body.serial_number,
          body.size,
          body.tread_depth_32nds,
          body.tread_low_threshold_32nds,
          body.installed_at ?? null,
          body.work_order_id ?? null,
          user.uuid,
        ]
      );
      const tireRecordId = res.rows[0]?.id == null ? null : String(res.rows[0].id);
      if (!tireRecordId) throw new Error("tire_record_insert_returned_no_row");
      const created = await fetchRecordById(client, body.operating_company_id, tireRecordId);
      if (!created) throw new Error("tire_record_reload_returned_no_row");
      await appendCrudAudit(client, user.uuid, "maintenance.tire_record.created", {
        operating_company_id: body.operating_company_id,
        position_code: body.position_code,
        brand_name: brandName,
      });
      return created;
    });
    if (row && "__error" in row) return reply.code(400).send({ error: row.__error });
    return reply.code(201).send(mapTireRecordRow(row));
  });

  app.patch("/api/v1/maintenance/tires/records/:id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params);
    const parsed = recordPatchSchema.safeParse(req.body);
    if (!params.success || !parsed.success) {
      return validationError(reply, (params.success ? parsed.error : params.error) as z.ZodError);
    }
    const body = parsed.data;

    const row = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const existing = await fetchRecordById(client, body.operating_company_id, params.data.id);
      if (!existing || existing.status === "archived") return null;
      if (!(await workOrderBelongsToCompany(client, body.operating_company_id, body.work_order_id))) {
        return { __error: "work_order_not_in_operating_company" as const };
      }

      let brandName = body.brand_name;
      if (body.brand_id !== undefined) {
        brandName = body.brand_id
          ? await resolveBrandName(client, body.operating_company_id, body.brand_id, String(existing.brand_name ?? ""))
          : "";
      }

      const sets: string[] = ["updated_at = now()"];
      const values: unknown[] = [];
      const add = (column: string, value: unknown) => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };
      if (body.brand_id !== undefined) add("brand_id", body.brand_id);
      if (brandName !== undefined) add("brand_name", brandName);
      if (body.serial_number !== undefined) add("serial_number", body.serial_number);
      if (body.size !== undefined) add("size", body.size);
      if (body.tread_depth_32nds !== undefined) add("tread_depth_32nds", body.tread_depth_32nds);
      if (body.tread_low_threshold_32nds !== undefined) add("tread_low_threshold_32nds", body.tread_low_threshold_32nds);
      if (body.installed_at !== undefined) add("installed_at", body.installed_at);
      if (body.work_order_id !== undefined) add("work_order_id", body.work_order_id);

      values.push(params.data.id, body.operating_company_id);
      const updated = await client.query(
        `UPDATE maintenance.tire_records SET ${sets.join(", ")}
         WHERE id = $${values.length - 1} AND operating_company_id = $${values.length}::uuid AND status <> 'archived'
         RETURNING id::text`,
        values
      );
      if (!updated.rows[0]) return null;
      await appendCrudAudit(client, user.uuid, "maintenance.tire_record.updated", {
        operating_company_id: body.operating_company_id,
        id: params.data.id,
      });
      return fetchRecordById(client, body.operating_company_id, params.data.id);
    });

    if (row && "__error" in row) return reply.code(400).send({ error: row.__error });
    if (!row) return reply.code(404).send({ error: "not_found" });
    return reply.send(mapTireRecordRow(row));
  });

  app.post("/api/v1/maintenance/tires/records/:id/archive", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params);
    const parsed = archiveSchema.safeParse(req.body);
    if (!params.success || !parsed.success) {
      return validationError(reply, (params.success ? parsed.error : params.error) as z.ZodError);
    }

    const archived = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const result = await client.query(
        `UPDATE maintenance.tire_records
         SET status = 'archived', archived_at = now(), archive_reason = $3, updated_at = now()
         WHERE id = $1 AND operating_company_id = $2::uuid AND status = 'active'
         RETURNING id::text`,
        [params.data.id, parsed.data.operating_company_id, parsed.data.archive_reason ?? "Archived from tire program"]
      );
      if (!result.rows[0]) return null;
      await appendCrudAudit(client, user.uuid, "maintenance.tire_record.archived", {
        operating_company_id: parsed.data.operating_company_id,
        id: params.data.id,
      });
      return result.rows[0];
    });
    if (!archived) return reply.code(404).send({ error: "not_found_or_not_active" });
    return reply.send({ ok: true, id: params.data.id });
  });

  app.get("/api/v1/maintenance/tires/events", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(reply, parsed.error);

    const result = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const filters = ["te.operating_company_id = $1::uuid"];
      const values: unknown[] = [parsed.data.operating_company_id];
      if (parsed.data.tire_record_id) {
        values.push(parsed.data.tire_record_id);
        filters.push(`te.tire_record_id = $${values.length}`);
      }
      if (parsed.data.unit_id) {
        values.push(parsed.data.unit_id);
        filters.push(`tr.unit_id = $${values.length}`);
      }
      if (parsed.data.equipment_id) {
        values.push(parsed.data.equipment_id);
        filters.push(`tr.equipment_id = $${values.length}`);
      }
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS total_count
         FROM maintenance.tire_events te
         JOIN maintenance.tire_records tr ON tr.id = te.tire_record_id
          AND tr.operating_company_id = te.operating_company_id
         WHERE ${filters.join(" AND ")}`,
        values
      );
      const res = await client.query(
        `SELECT te.id::text, te.tire_record_id::text, te.event_type, te.from_position_code, te.to_position_code,
                te.tread_depth_32nds, te.brand_id::text, te.brand_name, te.serial_number, te.notes,
                te.is_low_tread_alert, te.work_order_id::text, te.created_at
         FROM maintenance.tire_events te
         JOIN maintenance.tire_records tr ON tr.id = te.tire_record_id
          AND tr.operating_company_id = te.operating_company_id
         WHERE ${filters.join(" AND ")}
         ORDER BY te.created_at DESC, te.id DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, parsed.data.limit, parsed.data.offset]
      );
      return { rows: res.rows.map(mapTireEventRow), total_count: Number(countRes.rows[0]?.total_count ?? 0) };
    });
    return reply.send(result);
  });

  app.post("/api/v1/maintenance/tires/rotate", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = rotateSchema.safeParse(req.body);
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;
    if (!positionGroupForCode(body.to_position_code)) {
      return reply.code(400).send({ error: "invalid_position_code" });
    }

    const result = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const source = await fetchRecordById(client, body.operating_company_id, body.tire_record_id);
      if (!source || source.status !== "active") return null;
      if (!(await workOrderBelongsToCompany(client, body.operating_company_id, body.work_order_id))) {
        return { __error: "work_order_not_in_operating_company" as const };
      }

      const occupant = await client.query(
        `${RECORD_SELECT}
         WHERE tr.operating_company_id = $1::uuid AND tr.status = 'active' AND tr.position_code = $2
           AND (($3::uuid IS NOT NULL AND tr.unit_id = $3) OR ($4::uuid IS NOT NULL AND tr.equipment_id = $4))
         LIMIT 1`,
        [body.operating_company_id, body.to_position_code, source.unit_id ?? null, source.equipment_id ?? null]
      );

      const fromCode = String(source.position_code);
      const movedSource = await client.query(
        `UPDATE maintenance.tire_records
         SET position_code = $1, position_group = $2, updated_at = now()
         WHERE id = $3
           AND operating_company_id = $4::uuid
           AND status = 'active'
         RETURNING id`,
        [body.to_position_code, positionGroupForCode(body.to_position_code), body.tire_record_id, body.operating_company_id]
      );
      if (movedSource.rows.length !== 1) throw new Error("tire_rotation_source_update_failed");

      if (occupant.rows[0] && String(occupant.rows[0].id) !== body.tire_record_id) {
        const movedOccupant = await client.query(
          `UPDATE maintenance.tire_records
           SET position_code = $1, position_group = $2, updated_at = now()
           WHERE id = $3
             AND operating_company_id = $4::uuid
             AND status = 'active'
           RETURNING id`,
          [fromCode, positionGroupForCode(fromCode), occupant.rows[0].id, body.operating_company_id]
        );
        if (movedOccupant.rows.length !== 1) throw new Error("tire_rotation_occupant_update_failed");
        await client.query(
          `INSERT INTO maintenance.tire_events (
            operating_company_id, tire_record_id, event_type, from_position_code, to_position_code, notes, work_order_id, created_by_user_id
          ) VALUES ($1, $2, 'rotation', $3, $4, $5, $6, $7)`,
          [
            body.operating_company_id,
            occupant.rows[0].id,
            body.to_position_code,
            fromCode,
            body.notes,
            body.work_order_id ?? null,
            user.uuid,
          ]
        );
      }

      await client.query(
        `INSERT INTO maintenance.tire_events (
          operating_company_id, tire_record_id, event_type, from_position_code, to_position_code, notes, work_order_id, created_by_user_id
        ) VALUES ($1, $2, 'rotation', $3, $4, $5, $6, $7)`,
        [
          body.operating_company_id,
          body.tire_record_id,
          fromCode,
          body.to_position_code,
          body.notes,
          body.work_order_id ?? null,
          user.uuid,
        ]
      );

      await appendCrudAudit(client, user.uuid, "maintenance.tire_rotated", {
        operating_company_id: body.operating_company_id,
        tire_record_id: body.tire_record_id,
        from_position_code: fromCode,
        to_position_code: body.to_position_code,
      });
      return fetchRecordById(client, body.operating_company_id, body.tire_record_id);
    });

    if (result && "__error" in result) return reply.code(400).send({ error: result.__error });
    if (!result) return reply.code(404).send({ error: "not_found" });
    return reply.send({ record: mapTireRecordRow(result) });
  });

  app.post("/api/v1/maintenance/tires/replace", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = replaceSchema.safeParse(req.body);
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    const result = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const existing = await fetchRecordById(client, body.operating_company_id, body.tire_record_id);
      if (!existing || existing.status !== "active") return null;
      if (!(await workOrderBelongsToCompany(client, body.operating_company_id, body.work_order_id))) {
        return { __error: "work_order_not_in_operating_company" as const };
      }

      const archivedExisting = await client.query(
        `UPDATE maintenance.tire_records
         SET status = 'archived', archived_at = now(), archive_reason = $3, updated_at = now()
         WHERE id = $1 AND operating_company_id = $2::uuid AND status = 'active'
         RETURNING id`,
        [body.tire_record_id, body.operating_company_id, "Replaced via tire program"]
      );
      if (archivedExisting.rows.length !== 1) throw new Error("tire_replacement_source_archive_failed");

      const brandName = await resolveBrandName(client, body.operating_company_id, body.brand_id, body.brand_name);
      const insert = await client.query(
        `INSERT INTO maintenance.tire_records (
          operating_company_id, unit_id, equipment_id, position_code, position_group,
          brand_id, brand_name, serial_number, size, tread_depth_32nds, tread_low_threshold_32nds,
          installed_at, work_order_id, created_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12::date, CURRENT_DATE), $13, $14)
        RETURNING id`,
        [
          body.operating_company_id,
          existing.unit_id ?? null,
          existing.equipment_id ?? null,
          existing.position_code,
          existing.position_group,
          body.brand_id ?? null,
          brandName,
          body.serial_number,
          body.size ?? existing.size ?? "",
          body.tread_depth_32nds,
          body.tread_low_threshold_32nds,
          body.installed_at ?? null,
          body.work_order_id ?? null,
          user.uuid,
        ]
      );
      const newId = insert.rows[0]?.id == null ? null : String(insert.rows[0].id);
      if (!newId) throw new Error("tire_replacement_insert_returned_no_row");
      await client.query(
        `INSERT INTO maintenance.tire_events (
          operating_company_id, tire_record_id, event_type, brand_id, brand_name, serial_number, tread_depth_32nds, notes, work_order_id, created_by_user_id
        ) VALUES ($1, $2, 'replacement', $3, $4, $5, $6, $7, $8, $9)`,
        [
          body.operating_company_id,
          newId,
          body.brand_id ?? null,
          brandName,
          body.serial_number,
          body.tread_depth_32nds,
          body.notes,
          body.work_order_id ?? null,
          user.uuid,
        ]
      );
      await appendCrudAudit(client, user.uuid, "maintenance.tire_replaced", {
        operating_company_id: body.operating_company_id,
        previous_record_id: body.tire_record_id,
        new_record_id: newId,
      });
      return fetchRecordById(client, body.operating_company_id, newId);
    });

    if (result && "__error" in result) return reply.code(400).send({ error: result.__error });
    if (!result) return reply.code(404).send({ error: "not_found" });
    return reply.send({ record: mapTireRecordRow(result) });
  });

  app.post("/api/v1/maintenance/tires/tread-audit", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = treadAuditSchema.safeParse(req.body);
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    const result = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const existing = await fetchRecordById(client, body.operating_company_id, body.tire_record_id);
      if (!existing || existing.status !== "active") return null;

      const threshold = Number(existing.tread_low_threshold_32nds ?? 4);
      const alert = isLowTread(body.tread_depth_32nds, threshold);

      const updatedTread = await client.query(
        `UPDATE maintenance.tire_records SET tread_depth_32nds = $1, updated_at = now()
         WHERE id = $2 AND operating_company_id = $3::uuid AND status = 'active'
         RETURNING id`,
        [body.tread_depth_32nds, body.tire_record_id, body.operating_company_id]
      );
      if (updatedTread.rows.length !== 1) throw new Error("tire_tread_audit_update_failed");
      await client.query(
        `INSERT INTO maintenance.tire_events (
          operating_company_id, tire_record_id, event_type, tread_depth_32nds, notes, is_low_tread_alert, created_by_user_id
        ) VALUES ($1, $2, 'tread_audit', $3, $4, $5, $6)`,
        [body.operating_company_id, body.tire_record_id, body.tread_depth_32nds, body.notes, alert, user.uuid]
      );
      await appendCrudAudit(client, user.uuid, "maintenance.tire_tread_audited", {
        operating_company_id: body.operating_company_id,
        tire_record_id: body.tire_record_id,
        tread_depth_32nds: body.tread_depth_32nds,
        is_low_tread_alert: alert,
      });
      const updated = await fetchRecordById(client, body.operating_company_id, body.tire_record_id);
      return { record: updated, is_low_tread_alert: alert };
    });

    if (!result) return reply.code(404).send({ error: "not_found" });
    return reply.send({
      record: mapTireRecordRow(result.record ?? {}),
      is_low_tread_alert: result.is_low_tread_alert,
    });
  });

  app.get("/api/v1/maintenance/tires/alerts", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(reply, parsed.error);

    const rows = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const res = await client.query(
        `${RECORD_SELECT}
         WHERE tr.operating_company_id = $1::uuid
           AND tr.status = 'active'
           AND tr.tread_depth_32nds <= tr.tread_low_threshold_32nds
         ORDER BY tr.tread_depth_32nds ASC, tr.position_code`,
        [parsed.data.operating_company_id]
      );
      return res.rows.map(mapTireRecordRow);
    });
    return reply.send({ rows, count: rows.length });
  });
}
