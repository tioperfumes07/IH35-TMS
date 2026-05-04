import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const equipmentStatusSchema = z.enum(["InService", "OutOfService", "InMaintenance", "Sold", "Lost"]);
const equipmentTypeSchema = z.enum([
  "DryVan",
  "Reefer",
  "Flatbed",
  "Tanker",
  "Container",
  "Chassis",
  "StepDeck",
  "Lowboy",
]);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: equipmentStatusSchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  operating_company_id: z.string().uuid().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const createEquipmentBodySchema = z.object({
  equipment_number: z.string().trim().min(1).max(100),
  vin: z.string().trim().max(100).optional(),
  equipment_type: equipmentTypeSchema,
  make: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  year: z.number().int().min(1980).max(2100).optional(),
  status: equipmentStatusSchema.default("InService"),
  current_unit_id: z.string().uuid().optional(),
  current_location_id: z.string().uuid().optional(),
  owner_company_id: z.string().uuid().optional(),
  currently_leased_to_company_id: z.string().uuid().optional(),
  notes: z.string().trim().max(2000).optional(),
});

const updateEquipmentBodySchema = z
  .object({
    equipment_number: z.string().trim().min(1).max(100).optional(),
    vin: z.string().trim().max(100).nullable().optional(),
    equipment_type: equipmentTypeSchema.optional(),
    make: z.string().trim().max(100).nullable().optional(),
    model: z.string().trim().max(100).nullable().optional(),
    year: z.number().int().min(1980).max(2100).nullable().optional(),
    status: equipmentStatusSchema.optional(),
    current_unit_id: z.string().uuid().nullable().optional(),
    current_location_id: z.string().uuid().nullable().optional(),
    owner_company_id: z.string().uuid().optional(),
    currently_leased_to_company_id: z.string().uuid().nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    deactivated_at: z.string().datetime().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function isWriteRole(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager";
}

async function resolveAssetCompanyIds(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  userId: string,
  ownerCompanyId?: string,
  leasedCompanyId?: string
) {
  const resolvedOwnerId =
    ownerCompanyId ??
    (
      await client.query(
        `
          SELECT id
          FROM org.companies
          WHERE code = 'TRK'
            AND deactivated_at IS NULL
          LIMIT 1
        `
      )
    ).rows[0]?.id ??
    null;

  let resolvedLeasedId = leasedCompanyId ?? null;
  if (!resolvedLeasedId) {
    const res = await client.query(
      `
        SELECT c.id
        FROM identity.users u
        JOIN org.companies c ON c.id = u.default_company_id
        WHERE u.id = $1
          AND c.deactivated_at IS NULL
        UNION
        SELECT c.id
        FROM org.companies c
        WHERE c.id IN (SELECT org.user_accessible_company_ids())
        ORDER BY id
        LIMIT 1
      `,
      [userId]
    );
    resolvedLeasedId = res.rows[0]?.id ?? null;
  }

  return { resolvedOwnerId, resolvedLeasedId };
}

export async function registerEquipmentRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/equipment", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const { limit, offset, status, search, operating_company_id } = parsedQuery.data;

    const equipment = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [];
      if (status) {
        values.push(status);
        filters.push(`status = $${values.length}`);
      }
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(`(equipment_number ILIKE $${idx} OR vin ILIKE $${idx} OR make ILIKE $${idx} OR model ILIKE $${idx})`);
      }
      if (operating_company_id) {
        values.push(operating_company_id);
        const idx = values.length;
        filters.push(`(owner_company_id = $${idx} OR currently_leased_to_company_id = $${idx})`);
      }
      values.push(limit);
      values.push(offset);
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT
            id,
            equipment_number,
            vin,
            equipment_type,
            make,
            model,
            year,
            status,
            current_unit_id,
            current_location_id,
            owner_company_id,
            currently_leased_to_company_id,
            acquired_date,
            disposed_date,
            notes,
            created_at,
            updated_at,
            deactivated_at,
            created_by_user_id,
            updated_by_user_id
          FROM mdata.equipment
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows;
    });
    return { equipment };
  });

  app.post("/api/v1/mdata/equipment", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedBody = createEquipmentBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const { resolvedOwnerId, resolvedLeasedId } = await resolveAssetCompanyIds(
          client,
          authUser.uuid,
          b.owner_company_id,
          b.currently_leased_to_company_id
        );
        if (!resolvedOwnerId) {
          throw new Error("owner_company_id_required");
        }
        const res = await client.query(
          `
            INSERT INTO mdata.equipment (
              equipment_number, vin, equipment_type, make, model, year, status, current_unit_id, current_location_id,
              owner_company_id, currently_leased_to_company_id, notes, created_by_user_id, updated_by_user_id
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13
            )
            RETURNING
              id,
              equipment_number,
              vin,
              equipment_type,
              make,
              model,
              year,
              status,
              current_unit_id,
              current_location_id,
              owner_company_id,
              currently_leased_to_company_id,
              acquired_date,
              disposed_date,
              notes,
              created_at,
              updated_at,
              deactivated_at,
              created_by_user_id,
              updated_by_user_id
          `,
          [
            b.equipment_number,
            b.vin ?? null,
            b.equipment_type,
            b.make ?? null,
            b.model ?? null,
            b.year ?? null,
            b.status,
            b.current_unit_id ?? null,
            b.current_location_id ?? null,
            resolvedOwnerId,
            resolvedLeasedId,
            b.notes ?? null,
            authUser.uuid,
          ]
        );
        const row = res.rows[0];
        await appendCrudAudit(client, authUser.uuid, "mdata.equipment.created", {
          resource_id: row.id,
          resource_type: "mdata.equipment",
          id: row.id,
          equipment_number: row.equipment_number,
          equipment_type: row.equipment_type,
          status: row.status,
        });
        return row;
      });
      return reply.code(201).send(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "mdata_equipment_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_equipment_fk_reference" });
      if ((err as Error).message === "owner_company_id_required") {
        return reply.code(400).send({ error: "owner_company_id_required" });
      }
      throw err;
    }
  });

  app.get("/api/v1/mdata/equipment/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            id,
            equipment_number,
            vin,
            equipment_type,
            make,
            model,
            year,
            status,
            current_unit_id,
            current_location_id,
            owner_company_id,
            currently_leased_to_company_id,
            acquired_date,
            disposed_date,
            notes,
            created_at,
            updated_at,
            deactivated_at,
            created_by_user_id,
            updated_by_user_id
          FROM mdata.equipment
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "mdata_equipment_not_found" });
    return row;
  });

  app.patch("/api/v1/mdata/equipment/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateEquipmentBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };

    if ("equipment_number" in b) add("equipment_number", b.equipment_number ?? null);
    if ("vin" in b) add("vin", b.vin ?? null);
    if ("equipment_type" in b) add("equipment_type", b.equipment_type);
    if ("make" in b) add("make", b.make ?? null);
    if ("model" in b) add("model", b.model ?? null);
    if ("year" in b) add("year", b.year ?? null);
    if ("status" in b) add("status", b.status);
    if ("current_unit_id" in b) add("current_unit_id", b.current_unit_id ?? null);
    if ("current_location_id" in b) add("current_location_id", b.current_location_id ?? null);
    if ("owner_company_id" in b) add("owner_company_id", b.owner_company_id ?? null);
    if ("currently_leased_to_company_id" in b) add("currently_leased_to_company_id", b.currently_leased_to_company_id ?? null);
    if ("notes" in b) add("notes", b.notes ?? null);
    if ("deactivated_at" in b) add("deactivated_at", b.deactivated_at ?? null);
    add("updated_by_user_id", authUser.uuid);

    values.push(parsedParams.data.id);
    const idIdx = values.length;
    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const oldRes = await client.query(
          `
            SELECT
              id,
              equipment_number,
              vin,
              equipment_type,
              make,
              model,
              year,
              status,
              current_unit_id,
              current_location_id,
              owner_company_id,
              currently_leased_to_company_id,
              acquired_date,
              disposed_date,
              notes,
              created_at,
              updated_at,
              deactivated_at,
              created_by_user_id,
              updated_by_user_id
            FROM mdata.equipment
            WHERE id = $1
            LIMIT 1
          `,
          [parsedParams.data.id]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE mdata.equipment
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx}
            RETURNING
              id,
              equipment_number,
              vin,
              equipment_type,
              make,
              model,
              year,
              status,
              current_unit_id,
              current_location_id,
              acquired_date,
              disposed_date,
              notes,
              created_at,
              updated_at,
              deactivated_at,
              created_by_user_id,
              updated_by_user_id
          `,
          values
        );
        const updatedRow = res.rows[0] ?? null;
        if (!updatedRow) return null;

        const changes = buildPatchChanges(
          b as unknown as Record<string, unknown>,
          oldRow as Record<string, unknown>,
          updatedRow as Record<string, unknown>
        );
        await appendCrudAudit(client, authUser.uuid, "mdata.equipment.updated", {
          resource_id: updatedRow.id,
          resource_type: "mdata.equipment",
          changes,
        });
        return updatedRow;
      });
      if (!updated) return reply.code(404).send({ error: "mdata_equipment_not_found" });
      return updated;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "mdata_equipment_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_equipment_fk_reference" });
      throw err;
    }
  });

  app.post("/api/v1/mdata/equipment/:id/deactivate", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const deactivated = await withCurrentUser(authUser.uuid, async (client) => {
      const oldRes = await client.query(
        `
          SELECT id, deactivated_at
          FROM mdata.equipment
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      const oldRow = oldRes.rows[0] ?? null;
      if (!oldRow) return null;

      let deactivatedAt = oldRow.deactivated_at as string | null;
      let wasAlreadyDeactivated = oldRow.deactivated_at !== null;
      if (!wasAlreadyDeactivated) {
        const res = await client.query(
          `
            UPDATE mdata.equipment
            SET deactivated_at = now(), updated_by_user_id = $2
            WHERE id = $1
              AND deactivated_at IS NULL
            RETURNING id, deactivated_at
          `,
          [parsedParams.data.id, authUser.uuid]
        );
        deactivatedAt = (res.rows[0]?.deactivated_at as string | undefined) ?? deactivatedAt;
        wasAlreadyDeactivated = false;
      }

      await appendCrudAudit(client, authUser.uuid, "mdata.equipment.deactivated", {
        resource_id: oldRow.id,
        resource_type: "mdata.equipment",
        was_already_deactivated: wasAlreadyDeactivated,
      });

      return { id: oldRow.id, deactivated_at: deactivatedAt, was_already_deactivated: wasAlreadyDeactivated };
    });
    if (!deactivated) return reply.code(404).send({ error: "mdata_equipment_not_found" });
    return deactivated;
  });
}
