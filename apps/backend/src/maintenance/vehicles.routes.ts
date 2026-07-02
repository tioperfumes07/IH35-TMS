import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  search: z.string().trim().optional(),
  include_voided: z.coerce.boolean().optional().default(false),
});

const idParamsSchema = z.object({ id: z.string().uuid() });

const createSchema = z.object({
  unit_display_id: z.string().trim().min(1).max(100),
  vehicle_type: z.string().trim().max(80).optional(),
  make: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  year: z.number().int().min(1980).max(2100).optional(),
  vin: z.string().trim().min(1).max(100),
  plate: z.string().trim().max(50).optional(),
  mileage: z.number().int().nonnegative().optional(),
  status: z.enum(["InService", "OutOfService", "InMaintenance", "Sold", "Totaled"]).default("InService"),
  notes: z.string().trim().max(2000).optional(),
});

const updateSchema = z
  .object({
    vehicle_type: z.string().trim().max(80).nullable().optional(),
    make: z.string().trim().max(100).nullable().optional(),
    model: z.string().trim().max(100).nullable().optional(),
    year: z.number().int().min(1980).max(2100).nullable().optional(),
    vin: z.string().trim().min(1).max(100).optional(),
    plate: z.string().trim().max(50).nullable().optional(),
    mileage: z.number().int().nonnegative().nullable().optional(),
    status: z.enum(["InService", "OutOfService", "InMaintenance", "Sold", "Totaled"]).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

const voidSchema = z.object({ void_reason: z.string().trim().min(3).max(240) });

type CsvVehicleRow = {
  unit_display_id: string;
  vehicle_type: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string;
  plate: string | null;
  mileage: number | null;
  status: "InService" | "OutOfService" | "InMaintenance" | "Sold" | "Totaled";
  notes: string | null;
};

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function parseCsvLine(line: string): string[] {
  return line.split(",").map((cell) => cell.replace(/^\ufeff/, "").trim());
}

function parseVehiclesCsv(text: string): CsvVehicleRow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV requires header and at least one row");
  const headers = parseCsvLine(lines[0]);
  const required = ["unit_display_id", "vin"];
  for (const key of required) {
    if (!headers.includes(key)) throw new Error(`CSV missing required column: ${key}`);
  }
  return lines.slice(1).map((line) => {
    const row = parseCsvLine(line);
    const get = (key: string) => row[headers.indexOf(key)] ?? "";
    const yearRaw = get("year");
    const mileageRaw = get("mileage");
    const statusRaw = get("status") || "InService";
    const validStatuses = new Set(["InService", "OutOfService", "InMaintenance", "Sold", "Totaled"]);
    if (!validStatuses.has(statusRaw)) {
      throw new Error(`Invalid status "${statusRaw}" in CSV`);
    }
    return {
      unit_display_id: get("unit_display_id"),
      vehicle_type: get("vehicle_type") || null,
      make: get("make") || null,
      model: get("model") || null,
      year: yearRaw ? Number(yearRaw) : null,
      vin: get("vin"),
      plate: get("plate") || null,
      mileage: mileageRaw ? Number(mileageRaw) : null,
      status: statusRaw as CsvVehicleRow["status"],
      notes: get("notes") || null,
    };
  });
}

function isVehiclesCsvImportEnabled(): boolean {
  const flag = (process.env.VEHICLES_CSV_IMPORT_ENABLED ?? "").trim().toLowerCase();
  const explicitlyEnabled = flag === "1" || flag === "true" || flag === "yes";
  return process.env.NODE_ENV === "production" ? explicitlyEnabled : flag !== "0" && flag !== "false";
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> }) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    return fn(client);
  });
}

async function enqueueVehiclePushIfProjected(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> },
  unitId: string,
  operatingCompanyId: string,
  actorUserId: string
) {
  const row = await client.query(
    `SELECT samsara_vehicle_id FROM mdata.units WHERE id = $1 AND (owner_company_id = $2 OR currently_leased_to_company_id = $2) LIMIT 1`,
    [unitId, operatingCompanyId]
  );
  const samsaraVehicleId = row.rows[0]?.samsara_vehicle_id ?? null;
  if (!samsaraVehicleId) return false;
  await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
    "samsara.master_data.push_requested",
    JSON.stringify({
      entity: "vehicle",
      unit_id: unitId,
      samsara_vehicle_id: samsaraVehicleId,
      operating_company_id: operatingCompanyId,
      actor_user_id: actorUserId,
    }),
  ]);
  return true;
}

export async function registerMaintenanceVehiclesRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/vehicles", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const values: unknown[] = [query.data.operating_company_id];
      const filters = ["(u.owner_company_id = $1 OR u.currently_leased_to_company_id = $1)"];
      if (!query.data.include_voided) {
        filters.push("u.deactivated_at IS NULL");
      }
      if (query.data.search) {
        values.push(`%${query.data.search}%`);
        const idx = values.length;
        filters.push(`(u.unit_number ILIKE $${idx} OR u.vin ILIKE $${idx} OR u.make ILIKE $${idx} OR u.model ILIKE $${idx})`);
      }
      const sql = `
        SELECT
          u.id,
          u.unit_number AS unit_display_id,
          NULL::text AS vehicle_type,
          u.make,
          u.model,
          u.year,
          u.vin,
          u.license_plate AS plate,
          NULL::bigint AS mileage,
          u.status,
          u.notes,
          u.deactivated_at AS voided_at,
          NULL::text AS voided_reason,
          u.samsara_vehicle_id,
          CASE
            WHEN u.deactivated_at IS NOT NULL THEN 'Voided'
            WHEN u.samsara_vehicle_id IS NOT NULL THEN 'Samsara'
            ELSE 'Manual'
          END AS source
        FROM mdata.units u
        WHERE ${filters.join(" AND ")}
        ORDER BY u.updated_at DESC, u.created_at DESC
      `;
      const result = await client.query(sql, values);
      return result.rows;
    });
    return { rows, csv_import_enabled: isVehiclesCsvImportEnabled() };
  });

  app.post("/api/v1/maintenance/vehicles", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const body = createSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const companyId = (req.query as { operating_company_id?: string })?.operating_company_id;
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });
    const row = await withCompany(user.uuid, companyId, async (client) => {
      const inserted = await client.query(
        `
          INSERT INTO mdata.units (
            unit_number, vin, make, model, year, license_plate, status, notes,
            owner_company_id, currently_leased_to_company_id, created_by_user_id, updated_by_user_id
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$10)
          RETURNING id, unit_number AS unit_display_id, NULL::text AS vehicle_type, make, model, year, vin, license_plate AS plate, NULL::bigint AS mileage, status, notes, deactivated_at AS voided_at, NULL::text AS voided_reason, samsara_vehicle_id
        `,
        [
          body.data.unit_display_id,
          body.data.vin,
          body.data.make ?? null,
          body.data.model ?? null,
          body.data.year ?? null,
          body.data.plate ?? null,
          body.data.status,
          body.data.notes ?? null,
          companyId,
          user.uuid,
        ]
      );
      const created = inserted.rows[0];
      await appendCrudAudit(client, user.uuid, "maintenance.vehicles.created", {
        resource_id: created.id,
        unit_display_id: created.unit_display_id,
      });
      return created;
    });
    return reply.code(201).send(row);
  });

  app.patch("/api/v1/maintenance/vehicles/:id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = updateSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const companyId = (req.query as { operating_company_id?: string })?.operating_company_id;
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });
    const updated = await withCompany(user.uuid, companyId, async (client) => {
      // Entity scope (USMCA cross-entity leak fix): mdata.units has no operating_company_id and its
      // RLS is identity/role-scoped, so a by-id read/update must scope by the owner/leased pair.
      const oldRes = await client.query(
        `SELECT * FROM mdata.units WHERE id = $1 AND (owner_company_id = $2 OR currently_leased_to_company_id = $2) LIMIT 1`,
        [params.data.id, companyId]
      );
      const oldRow = oldRes.rows[0];
      if (!oldRow) return null;
      const setParts: string[] = [];
      const values: unknown[] = [];
      const add = (col: string, val: unknown) => {
        values.push(val);
        setParts.push(`${col} = $${values.length}`);
      };
      if ("make" in body.data) add("make", body.data.make ?? null);
      if ("model" in body.data) add("model", body.data.model ?? null);
      if ("year" in body.data) add("year", body.data.year ?? null);
      if ("vin" in body.data) add("vin", body.data.vin ?? null);
      if ("plate" in body.data) add("license_plate", body.data.plate ?? null);
      if ("status" in body.data) add("status", body.data.status);
      if ("notes" in body.data) add("notes", body.data.notes ?? null);
      add("updated_by_user_id", user.uuid);
      values.push(params.data.id);
      const idIdx = values.length;
      values.push(companyId);
      const coIdx = values.length;
      const row = await client.query(
        `UPDATE mdata.units SET ${setParts.join(", ")} WHERE id = $${idIdx} AND (owner_company_id = $${coIdx} OR currently_leased_to_company_id = $${coIdx}) RETURNING *`,
        values
      );
      const newRow = row.rows[0];
      const pushed = await enqueueVehiclePushIfProjected(client, params.data.id, companyId, user.uuid);
      await appendCrudAudit(client, user.uuid, "maintenance.vehicles.updated", {
        resource_id: params.data.id,
        projected_push_enqueued: pushed,
        changes: buildPatchChanges(
          body.data as unknown as Record<string, unknown>,
          oldRow as Record<string, unknown>,
          newRow as Record<string, unknown>
        ),
      });
      return newRow;
    });
    if (!updated) return reply.code(404).send({ error: "maintenance_vehicle_not_found" });
    return updated;
  });

  app.patch("/api/v1/maintenance/vehicles/:id/void", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = voidSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const companyId = (req.query as { operating_company_id?: string })?.operating_company_id;
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });
    const result = await withCompany(user.uuid, companyId, async (client) => {
      const res = await client.query(
        // Entity scope (USMCA cross-entity leak fix): scope the void by the owner/leased pair so a unit
        // in another operating company cannot be voided by id.
        `UPDATE mdata.units SET deactivated_at = now(), notes = CONCAT(COALESCE(notes, ''), CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\n' END, '[VOID] ', $2), updated_by_user_id = $3 WHERE id = $1 AND (owner_company_id = $4 OR currently_leased_to_company_id = $4) RETURNING id`,
        [params.data.id, body.data.void_reason, user.uuid, companyId]
      );
      if (!res.rows[0]) return null;
      const pushed = await enqueueVehiclePushIfProjected(client, params.data.id, companyId, user.uuid);
      await appendCrudAudit(client, user.uuid, "maintenance.vehicles.voided", {
        resource_id: params.data.id,
        void_reason: body.data.void_reason,
        projected_push_enqueued: pushed,
      });
      return res.rows[0];
    });
    if (!result) return reply.code(404).send({ error: "maintenance_vehicle_not_found" });
    return { ok: true };
  });

  app.post("/api/v1/maintenance/vehicles/import", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isVehiclesCsvImportEnabled()) {
      return reply.code(403).send({ error: "vehicles_csv_import_disabled" });
    }
    const companyId = (req.query as { operating_company_id?: string })?.operating_company_id;
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });
    let csvText = "";
    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "file") {
        csvText = (await part.toBuffer()).toString("utf8");
        break;
      }
    }
    if (!csvText.trim()) return reply.code(400).send({ error: "file_required" });
    let rows: CsvVehicleRow[] = [];
    try {
      rows = parseVehiclesCsv(csvText);
    } catch (error) {
      return reply.code(400).send({ error: "invalid_csv", message: (error as Error).message });
    }
    const summary = await withCompany(user.uuid, companyId, async (client) => {
      let inserted = 0;
      const errors: Array<{ row: number; message: string }> = [];
      await client.query("BEGIN");
      try {
        for (let i = 0; i < rows.length; i += 1) {
          const row = rows[i];
          try {
            await client.query(
              `
                INSERT INTO mdata.units (
                  unit_number, vin, make, model, year, license_plate, status, notes, vehicle_type, mileage,
                  owner_company_id, currently_leased_to_company_id, created_by_user_id, updated_by_user_id
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12,$12)
              `,
              [
                row.unit_display_id,
                row.vin,
                row.make,
                row.model,
                row.year,
                row.plate,
                row.status,
                row.notes,
                row.vehicle_type,
                row.mileage,
                companyId,
                user.uuid,
              ]
            );
            inserted += 1;
          } catch (error) {
            errors.push({ row: i + 2, message: (error as Error).message });
          }
        }
        if (errors.length > 0) {
          await client.query("ROLLBACK");
        } else {
          await client.query("COMMIT");
          await appendCrudAudit(client, user.uuid, "maintenance.vehicles.imported", {
            operating_company_id: companyId,
            imported_rows: inserted,
          });
        }
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      return { inserted_rows: inserted, invalid_rows: errors.length, errors };
    });
    return summary;
  });
}
