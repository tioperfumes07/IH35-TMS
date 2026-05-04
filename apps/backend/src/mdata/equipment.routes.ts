import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
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

export async function registerEquipmentRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/equipment", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const { limit, offset, status, search } = parsedQuery.data;

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
        const res = await client.query(
          `
            INSERT INTO mdata.equipment (
              equipment_number, vin, equipment_type, make, model, year, status, current_unit_id, current_location_id,
              notes, created_by_user_id, updated_by_user_id
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11
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
            b.notes ?? null,
            authUser.uuid,
          ]
        );
        return res.rows[0];
      });
      return reply.code(201).send(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "mdata_equipment_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_equipment_fk_reference" });
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
    if ("notes" in b) add("notes", b.notes ?? null);
    if ("deactivated_at" in b) add("deactivated_at", b.deactivated_at ?? null);
    add("updated_by_user_id", authUser.uuid);

    values.push(parsedParams.data.id);
    const idIdx = values.length;
    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
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
        return res.rows[0] ?? null;
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
      return res.rows[0] ?? null;
    });
    if (!deactivated) return reply.code(404).send({ error: "mdata_equipment_not_found" });
    return deactivated;
  });
}
