import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const unitStatusSchema = z.enum(["InService", "OutOfService", "InMaintenance", "Sold", "Totaled"]);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: unitStatusSchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const createUnitBodySchema = z.object({
  unit_number: z.string().trim().min(1).max(100),
  vin: z.string().trim().min(1).max(100),
  make: z.string().trim().max(100).optional(),
  model: z.string().trim().max(100).optional(),
  year: z.number().int().min(1980).max(2100).optional(),
  license_plate: z.string().trim().max(50).optional(),
  license_state: z.string().trim().max(50).optional(),
  status: unitStatusSchema.default("InService"),
  assigned_driver_id: z.string().uuid().optional(),
  acquired_date: isoDateSchema.optional(),
  notes: z.string().trim().max(2000).optional(),
});

const updateUnitBodySchema = z
  .object({
    unit_number: z.string().trim().min(1).max(100).optional(),
    vin: z.string().trim().min(1).max(100).optional(),
    make: z.string().trim().max(100).nullable().optional(),
    model: z.string().trim().max(100).nullable().optional(),
    year: z.number().int().min(1980).max(2100).nullable().optional(),
    license_plate: z.string().trim().max(50).nullable().optional(),
    license_state: z.string().trim().max(50).nullable().optional(),
    status: unitStatusSchema.optional(),
    assigned_driver_id: z.string().uuid().nullable().optional(),
    acquired_date: isoDateSchema.nullable().optional(),
    disposed_date: isoDateSchema.nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    deactivated_at: isoDateSchema.nullable().optional(),
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

export async function registerUnitsRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/units", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const { limit, offset, status, search } = parsedQuery.data;

    const units = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [];
      if (status) {
        values.push(status);
        filters.push(`status = $${values.length}`);
      }
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(`(unit_number ILIKE $${idx} OR vin ILIKE $${idx} OR make ILIKE $${idx} OR model ILIKE $${idx})`);
      }
      values.push(limit);
      values.push(offset);
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT
            id, unit_number, vin, make, model, year, license_plate, license_state, status,
            assigned_driver_id, acquired_date, disposed_date, notes,
            created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          FROM mdata.units
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows;
    });

    return { units };
  });

  app.post("/api/v1/mdata/units", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedBody = createUnitBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const res = await client.query(
          `
            INSERT INTO mdata.units (
              unit_number, vin, make, model, year, license_plate, license_state, status,
              assigned_driver_id, acquired_date, notes, created_by_user_id, updated_by_user_id
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12
            )
            RETURNING
              id, unit_number, vin, make, model, year, license_plate, license_state, status,
              assigned_driver_id, acquired_date, disposed_date, notes,
              created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          `,
          [
            b.unit_number,
            b.vin,
            b.make ?? null,
            b.model ?? null,
            b.year ?? null,
            b.license_plate ?? null,
            b.license_state ?? null,
            b.status,
            b.assigned_driver_id ?? null,
            b.acquired_date ?? null,
            b.notes ?? null,
            authUser.uuid,
          ]
        );
        return res.rows[0];
      });
      return reply.code(201).send(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "mdata_unit_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_assigned_driver_id" });
      throw err;
    }
  });

  app.get("/api/v1/mdata/units/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            id, unit_number, vin, make, model, year, license_plate, license_state, status,
            assigned_driver_id, acquired_date, disposed_date, notes,
            created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          FROM mdata.units
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "mdata_unit_not_found" });
    return row;
  });

  app.patch("/api/v1/mdata/units/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateUnitBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };
    if ("unit_number" in b) add("unit_number", b.unit_number ?? null);
    if ("vin" in b) add("vin", b.vin ?? null);
    if ("make" in b) add("make", b.make ?? null);
    if ("model" in b) add("model", b.model ?? null);
    if ("year" in b) add("year", b.year ?? null);
    if ("license_plate" in b) add("license_plate", b.license_plate ?? null);
    if ("license_state" in b) add("license_state", b.license_state ?? null);
    if ("status" in b) add("status", b.status ?? null);
    if ("assigned_driver_id" in b) add("assigned_driver_id", b.assigned_driver_id ?? null);
    if ("acquired_date" in b) add("acquired_date", b.acquired_date ?? null);
    if ("disposed_date" in b) add("disposed_date", b.disposed_date ?? null);
    if ("notes" in b) add("notes", b.notes ?? null);
    if ("deactivated_at" in b) add("deactivated_at", b.deactivated_at ?? null);
    add("updated_by_user_id", authUser.uuid);

    values.push(parsedParams.data.id);
    const idIdx = values.length;
    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const res = await client.query(
          `
            UPDATE mdata.units
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx}
            RETURNING
              id, unit_number, vin, make, model, year, license_plate, license_state, status,
              assigned_driver_id, acquired_date, disposed_date, notes,
              created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          `,
          values
        );
        return res.rows[0] ?? null;
      });
      if (!updated) return reply.code(404).send({ error: "mdata_unit_not_found" });
      return updated;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "mdata_unit_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_assigned_driver_id" });
      throw err;
    }
  });

  app.post("/api/v1/mdata/units/:id/deactivate", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const deactivated = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE mdata.units
          SET deactivated_at = now(), updated_by_user_id = $2
          WHERE id = $1
            AND deactivated_at IS NULL
          RETURNING id, deactivated_at
        `,
        [parsedParams.data.id, authUser.uuid]
      );
      return res.rows[0] ?? null;
    });
    if (!deactivated) return reply.code(404).send({ error: "mdata_unit_not_found" });
    return deactivated;
  });
}
