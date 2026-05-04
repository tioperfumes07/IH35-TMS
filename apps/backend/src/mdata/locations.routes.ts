import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const locationTypeSchema = z.enum(["Customer", "Vendor", "IH35Yard", "TruckStop", "Other"]);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(["active", "inactive"]).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  location_type: locationTypeSchema.optional(),
  operating_company_id: z.string().uuid().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const createLocationBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  location_code: z.string().trim().max(100).optional(),
  location_type: locationTypeSchema,
  linked_customer_id: z.string().uuid().optional(),
  linked_vendor_id: z.string().uuid().optional(),
  operating_company_id: z.string().uuid().optional(),
  address: z.string().trim().max(500).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const updateLocationBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    location_code: z.string().trim().max(100).nullable().optional(),
    location_type: locationTypeSchema.optional(),
    linked_customer_id: z.string().uuid().nullable().optional(),
    linked_vendor_id: z.string().uuid().nullable().optional(),
    operating_company_id: z.string().uuid().optional(),
    address: z.string().trim().max(500).nullable().optional(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
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
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Dispatcher";
}

async function resolveOperatingCompanyId(
  client: { query: (sql: string, values: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  userId: string,
  requested?: string
) {
  if (requested) return requested;
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
  return res.rows[0]?.id ?? null;
}

async function assertUniqueLocationName(authUserId: string, name: string, excludeId?: string): Promise<boolean> {
  return withCurrentUser(authUserId, async (client) => {
    const values: unknown[] = [name];
    let where = "location_name = $1";
    if (excludeId) {
      values.push(excludeId);
      where += " AND id <> $2";
    }
    const res = await client.query(`SELECT id FROM mdata.locations WHERE ${where} LIMIT 1`, values);
    return res.rows.length > 0;
  });
}

export async function registerLocationRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/locations", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const { limit, offset, status, search, location_type, operating_company_id } = parsedQuery.data;
    const locations = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [];
      if (status === "active") filters.push("deactivated_at IS NULL");
      if (status === "inactive") filters.push("deactivated_at IS NOT NULL");
      if (location_type) {
        values.push(location_type);
        filters.push(`location_type = $${values.length}`);
      }
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(`(location_name ILIKE $${idx} OR location_code ILIKE $${idx} OR address_line1 ILIKE $${idx})`);
      }
      if (operating_company_id) {
        values.push(operating_company_id);
        filters.push(`operating_company_id = $${values.length}`);
      }
      values.push(limit);
      values.push(offset);
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT
            id,
            location_name AS name,
            location_code,
            location_type,
            linked_customer_id,
            linked_vendor_id,
            operating_company_id,
            address_line1 AS address,
            latitude AS lat,
            longitude AS lng,
            notes,
            created_at,
            updated_at,
            deactivated_at,
            created_by_user_id,
            updated_by_user_id
          FROM mdata.locations
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows;
    });
    return { locations };
  });

  app.post("/api/v1/mdata/locations", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedBody = createLocationBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    if (await assertUniqueLocationName(authUser.uuid, b.name)) {
      return reply.code(409).send({ error: "mdata_location_name_conflict" });
    }

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const resolvedOperatingCompanyId = await resolveOperatingCompanyId(client, authUser.uuid, b.operating_company_id);
        if (!resolvedOperatingCompanyId) {
          throw new Error("operating_company_id_required");
        }
        const res = await client.query(
          `
            INSERT INTO mdata.locations (
              location_name, location_code, location_type, linked_customer_id, linked_vendor_id, operating_company_id, address_line1,
              latitude, longitude, notes, created_by_user_id, updated_by_user_id
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11
            )
            RETURNING
              id,
              location_name AS name,
              location_code,
              location_type,
              linked_customer_id,
              linked_vendor_id,
              operating_company_id,
              address_line1 AS address,
              latitude AS lat,
              longitude AS lng,
              notes,
              created_at,
              updated_at,
              deactivated_at,
              created_by_user_id,
              updated_by_user_id
          `,
          [
            b.name,
            b.location_code ?? null,
            b.location_type,
            b.linked_customer_id ?? null,
            b.linked_vendor_id ?? null,
            resolvedOperatingCompanyId,
            b.address ?? null,
            b.lat ?? null,
            b.lng ?? null,
            b.notes ?? null,
            authUser.uuid,
          ]
        );
        const row = res.rows[0];
        await appendCrudAudit(client, authUser.uuid, "mdata.locations.created", {
          resource_id: row.id,
          resource_type: "mdata.locations",
          id: row.id,
          name: row.name,
          location_code: row.location_code,
          location_type: row.location_type,
        });
        return row;
      });
      return reply.code(201).send(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "mdata_location_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_location_reference_fk" });
      if ((err as Error).message === "operating_company_id_required") {
        return reply.code(400).send({ error: "operating_company_id_required" });
      }
      throw err;
    }
  });

  app.get("/api/v1/mdata/locations/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            id,
            location_name AS name,
            location_code,
            location_type,
            linked_customer_id,
            linked_vendor_id,
            operating_company_id,
            address_line1 AS address,
            latitude AS lat,
            longitude AS lng,
            notes,
            created_at,
            updated_at,
            deactivated_at,
            created_by_user_id,
            updated_by_user_id
          FROM mdata.locations
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "mdata_location_not_found" });
    return row;
  });

  app.patch("/api/v1/mdata/locations/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateLocationBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    if (b.name && (await assertUniqueLocationName(authUser.uuid, b.name, parsedParams.data.id))) {
      return reply.code(409).send({ error: "mdata_location_name_conflict" });
    }

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };

    if ("name" in b) add("location_name", b.name ?? null);
    if ("location_code" in b) add("location_code", b.location_code ?? null);
    if ("location_type" in b && b.location_type) add("location_type", b.location_type);
    if ("linked_customer_id" in b) add("linked_customer_id", b.linked_customer_id ?? null);
    if ("linked_vendor_id" in b) add("linked_vendor_id", b.linked_vendor_id ?? null);
    if ("operating_company_id" in b) add("operating_company_id", b.operating_company_id ?? null);
    if ("address" in b) add("address_line1", b.address ?? null);
    if ("lat" in b) add("latitude", b.lat ?? null);
    if ("lng" in b) add("longitude", b.lng ?? null);
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
              location_name AS name,
              location_code,
              location_type,
              linked_customer_id,
              linked_vendor_id,
              operating_company_id,
              address_line1 AS address,
              latitude AS lat,
              longitude AS lng,
              notes,
              created_at,
              updated_at,
              deactivated_at,
              created_by_user_id,
              updated_by_user_id
            FROM mdata.locations
            WHERE id = $1
            LIMIT 1
          `,
          [parsedParams.data.id]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE mdata.locations
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx}
            RETURNING
              id,
              location_name AS name,
              location_code,
              location_type,
              linked_customer_id,
              linked_vendor_id,
              address_line1 AS address,
              latitude AS lat,
              longitude AS lng,
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
        await appendCrudAudit(client, authUser.uuid, "mdata.locations.updated", {
          resource_id: updatedRow.id,
          resource_type: "mdata.locations",
          changes,
        });
        return updatedRow;
      });
      if (!updated) return reply.code(404).send({ error: "mdata_location_not_found" });
      return updated;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "mdata_location_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_location_reference_fk" });
      throw err;
    }
  });

  app.post("/api/v1/mdata/locations/:id/deactivate", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const deactivated = await withCurrentUser(authUser.uuid, async (client) => {
      const oldRes = await client.query(
        `
          SELECT id, deactivated_at
          FROM mdata.locations
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
            UPDATE mdata.locations
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

      await appendCrudAudit(client, authUser.uuid, "mdata.locations.deactivated", {
        resource_id: oldRow.id,
        resource_type: "mdata.locations",
        was_already_deactivated: wasAlreadyDeactivated,
      });

      return { id: oldRow.id, deactivated_at: deactivatedAt, was_already_deactivated: wasAlreadyDeactivated };
    });
    if (!deactivated) return reply.code(404).send({ error: "mdata_location_not_found" });
    return deactivated;
  });
}
