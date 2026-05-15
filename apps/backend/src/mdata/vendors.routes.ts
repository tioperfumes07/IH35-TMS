import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const vendorTypeSchema = z.enum(["Fuel", "Repair", "Tires", "Towing", "Insurance", "Permit", "Toll", "Other"]);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(["active", "inactive"]).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  vendor_type: vendorTypeSchema.optional(),
  operating_company_id: z.string().uuid().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const createVendorBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  vendor_code: z.string().trim().max(100).optional(),
  vendor_type: vendorTypeSchema,
  phone: z.string().trim().max(50).optional(),
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase())
    .optional(),
  operating_company_id: z.string().uuid().optional(),
  address: z.string().trim().max(500).optional(),
  tax_id: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const updateVendorBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    vendor_code: z.string().trim().max(100).nullable().optional(),
    vendor_type: vendorTypeSchema.optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    email: z
      .string()
      .email()
      .transform((v) => v.toLowerCase())
      .nullable()
      .optional(),
    operating_company_id: z.string().uuid().optional(),
    address: z.string().trim().max(500).nullable().optional(),
    tax_id: z.string().trim().max(100).nullable().optional(),
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
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
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

export async function registerVendorRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/vendors", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const { limit, offset, status, search, vendor_type, operating_company_id } = parsedQuery.data;
    const vendors = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [];
      if (status === "active") filters.push("deactivated_at IS NULL");
      if (status === "inactive") filters.push("deactivated_at IS NOT NULL");
      if (vendor_type) {
        values.push(vendor_type);
        filters.push(`vendor_type = $${values.length}`);
      }
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(`(vendor_name ILIKE $${idx} OR vendor_code ILIKE $${idx} OR email ILIKE $${idx})`);
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
            vendor_name AS name,
            vendor_code,
            vendor_type,
            vendor_category,
            vendor_category_locked_at,
            phone,
            email,
            operating_company_id,
            address_line1 AS address,
            tax_id,
            notes,
            created_at,
            updated_at,
            deactivated_at,
            created_by_user_id,
            updated_by_user_id
          FROM mdata.vendors
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows;
    });
    return { vendors };
  });

  app.post("/api/v1/mdata/vendors", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedBody = createVendorBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const resolvedOperatingCompanyId = await resolveOperatingCompanyId(client, authUser.uuid, b.operating_company_id);
        if (!resolvedOperatingCompanyId) {
          throw new Error("operating_company_id_required");
        }
        const res = await client.query(
          `
            INSERT INTO mdata.vendors (
              vendor_name, vendor_code, vendor_type, phone, email, operating_company_id, address_line1, tax_id, notes,
              created_by_user_id, updated_by_user_id
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10
            )
            RETURNING
              id,
              vendor_name AS name,
              vendor_code,
              vendor_type,
              vendor_category,
              vendor_category_locked_at,
              phone,
              email,
              operating_company_id,
              address_line1 AS address,
              tax_id,
              notes,
              created_at,
              updated_at,
              deactivated_at,
              created_by_user_id,
              updated_by_user_id
          `,
          [
            b.name,
            b.vendor_code ?? null,
            b.vendor_type,
            b.phone ?? null,
            b.email ?? null,
            resolvedOperatingCompanyId,
            b.address ?? null,
            b.tax_id ?? null,
            b.notes ?? null,
            authUser.uuid,
          ]
        );
        const row = res.rows[0];
        await appendCrudAudit(client, authUser.uuid, "mdata.vendors.created", {
          resource_id: row.id,
          resource_type: "mdata.vendors",
          id: row.id,
          name: row.name,
          vendor_code: row.vendor_code,
          vendor_type: row.vendor_type,
        });
        return row;
      });
      return reply.code(201).send(created);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        return reply.code(409).send({ error: "mdata_vendor_conflict" });
      }
      if ((err as Error).message === "operating_company_id_required") {
        return reply.code(400).send({ error: "operating_company_id_required" });
      }
      throw err;
    }
  });

  app.get("/api/v1/mdata/vendors/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            id,
            vendor_name AS name,
            vendor_code,
            vendor_type,
            vendor_category,
            vendor_category_locked_at,
            phone,
            email,
            operating_company_id,
            address_line1 AS address,
            tax_id,
            notes,
            created_at,
            updated_at,
            deactivated_at,
            created_by_user_id,
            updated_by_user_id
          FROM mdata.vendors
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "mdata_vendor_not_found" });
    return row;
  });

  app.patch("/api/v1/mdata/vendors/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateVendorBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };
    if ("name" in b) add("vendor_name", b.name ?? null);
    if ("vendor_code" in b) add("vendor_code", b.vendor_code ?? null);
    if ("vendor_type" in b) add("vendor_type", b.vendor_type);
    if ("phone" in b) add("phone", b.phone ?? null);
    if ("email" in b) add("email", b.email ?? null);
    if ("operating_company_id" in b) add("operating_company_id", b.operating_company_id ?? null);
    if ("address" in b) add("address_line1", b.address ?? null);
    if ("tax_id" in b) add("tax_id", b.tax_id ?? null);
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
              vendor_name AS name,
              vendor_code,
              vendor_type,
              vendor_category,
              vendor_category_locked_at,
              phone,
              email,
              operating_company_id,
              address_line1 AS address,
              tax_id,
              notes,
              created_at,
              updated_at,
              deactivated_at,
              created_by_user_id,
              updated_by_user_id
            FROM mdata.vendors
            WHERE id = $1
            LIMIT 1
          `,
          [parsedParams.data.id]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE mdata.vendors
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx}
            RETURNING
              id,
              vendor_name AS name,
              vendor_code,
              vendor_type,
              vendor_category,
              vendor_category_locked_at,
              phone,
              email,
              address_line1 AS address,
              tax_id,
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
        await appendCrudAudit(client, authUser.uuid, "mdata.vendors.updated", {
          resource_id: updatedRow.id,
          resource_type: "mdata.vendors",
          changes,
        });
        return updatedRow;
      });
      if (!updated) return reply.code(404).send({ error: "mdata_vendor_not_found" });
      return updated;
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        return reply.code(409).send({ error: "mdata_vendor_conflict" });
      }
      throw err;
    }
  });

  app.post("/api/v1/mdata/vendors/:id/deactivate", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const deactivated = await withCurrentUser(authUser.uuid, async (client) => {
      const oldRes = await client.query(
        `
          SELECT id, deactivated_at
          FROM mdata.vendors
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
            UPDATE mdata.vendors
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

      await appendCrudAudit(client, authUser.uuid, "mdata.vendors.deactivated", {
        resource_id: oldRow.id,
        resource_type: "mdata.vendors",
        was_already_deactivated: wasAlreadyDeactivated,
      });

      return { id: oldRow.id, deactivated_at: deactivatedAt, was_already_deactivated: wasAlreadyDeactivated };
    });
    if (!deactivated) return reply.code(404).send({ error: "mdata_vendor_not_found" });
    return deactivated;
  });
}
