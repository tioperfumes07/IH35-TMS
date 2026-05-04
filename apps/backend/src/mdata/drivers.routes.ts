import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const driverStatusSchema = z.enum(["Active", "Probation", "Inactive", "Terminated", "OnLeave"]);
const cdlClassSchema = z.enum(["A", "B", "C"]);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const e164PhoneSchema = z.string().regex(/^\+\d{10,15}$/, "phone must be E.164 format (e.g., +19565550001)");

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: driverStatusSchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const createDriverBodySchema = z.object({
  identity_user_id: z.string().uuid().optional(),
  create_login_user: z.boolean().optional().default(false),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  phone: e164PhoneSchema,
  email: z
    .string()
    .email()
    .refine((v) => v === v.toLowerCase(), { message: "email must be lowercase" })
    .optional(),
  cdl_number: z.string().trim().max(100).optional(),
  cdl_state: z.string().trim().max(50).optional(),
  cdl_class: cdlClassSchema.optional(),
  cdl_expires_at: isoDateSchema.optional(),
  hire_date: isoDateSchema.optional(),
  dot_medical_expires_at: isoDateSchema.optional(),
  hazmat_endorsement_expires_at: isoDateSchema.optional(),
  status: driverStatusSchema.default("Active"),
  notes: z.string().trim().max(2000).optional(),
});

const updateDriverBodySchema = z
  .object({
    identity_user_id: z.string().uuid().nullable().optional(),
    first_name: z.string().trim().min(1).max(100).optional(),
    last_name: z.string().trim().min(1).max(100).optional(),
    phone: z.string().trim().min(1).max(50).optional(),
    email: z
      .string()
      .email()
      .refine((v) => v === v.toLowerCase(), { message: "email must be lowercase" })
      .nullable()
      .optional(),
    cdl_number: z.string().trim().max(100).nullable().optional(),
    cdl_state: z.string().trim().max(50).nullable().optional(),
    cdl_class: cdlClassSchema.nullable().optional(),
    cdl_expires_at: isoDateSchema.nullable().optional(),
    hire_date: isoDateSchema.nullable().optional(),
    dot_medical_expires_at: isoDateSchema.nullable().optional(),
    hazmat_endorsement_expires_at: isoDateSchema.nullable().optional(),
    status: driverStatusSchema.optional(),
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

function statusDisablesDriverLogin(status: string): boolean {
  return status === "Inactive" || status === "Terminated";
}

export async function registerDriverRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/drivers", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const { limit, offset, status, search } = parsedQuery.data;
    const drivers = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [];
      if (status) {
        values.push(status);
        filters.push(`status = $${values.length}`);
      }
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(`(first_name ILIKE $${idx} OR last_name ILIKE $${idx} OR cdl_number ILIKE $${idx})`);
      }
      values.push(limit);
      values.push(offset);
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT
            id, identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
            cdl_expires_at, hire_date, termination_date, dot_medical_expires_at, hazmat_endorsement_expires_at,
            status, notes, created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          FROM mdata.drivers
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows;
    });

    return { drivers };
  });

  app.post("/api/v1/mdata/drivers", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedBody = createDriverBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        let identityUserId = b.identity_user_id ?? null;
        if (b.create_login_user) {
          const userRes = await client.query<{ id: string }>(
            `
              INSERT INTO identity.users (email, role, phone)
              VALUES (NULL, 'Driver', $1)
              RETURNING id
            `,
            [b.phone]
          );
          identityUserId = userRes.rows[0]?.id ?? null;
          if (!identityUserId) {
            throw new Error("failed_to_create_identity_user");
          }
        }

        const res = await client.query(
          `
            INSERT INTO mdata.drivers (
              identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
              cdl_expires_at, hire_date, dot_medical_expires_at, hazmat_endorsement_expires_at, status, notes,
              created_by_user_id, updated_by_user_id
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15
            )
            RETURNING
              id, identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
              cdl_expires_at, hire_date, termination_date, dot_medical_expires_at, hazmat_endorsement_expires_at,
              status, notes, created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          `,
          [
            identityUserId,
            b.first_name,
            b.last_name,
            b.phone,
            b.email ?? null,
            b.cdl_number ?? null,
            b.cdl_state ?? null,
            b.cdl_class ?? null,
            b.cdl_expires_at ?? null,
            b.hire_date ?? null,
            b.dot_medical_expires_at ?? null,
            b.hazmat_endorsement_expires_at ?? null,
            b.status,
            b.notes ?? null,
            authUser.uuid,
          ]
        );
        const row = res.rows[0];
        if (b.create_login_user && identityUserId) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "identity.users.created",
            {
              resource_id: identityUserId,
              resource_type: "identity.users",
              phone: b.phone,
              role: "Driver",
              linked_driver_id: row.id,
            },
            "warning",
            "BT-1-AUTH-DRIVER"
          );
        }
        await appendCrudAudit(client, authUser.uuid, "mdata.drivers.created", {
          resource_id: row.id,
          resource_type: "mdata.drivers",
          id: row.id,
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          status: row.status,
        });
        return row;
      });
      return reply.code(201).send(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "mdata_driver_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_identity_user_id" });
      throw err;
    }
  });

  app.get("/api/v1/mdata/drivers/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            id, identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
            cdl_expires_at, hire_date, termination_date, dot_medical_expires_at, hazmat_endorsement_expires_at,
            status, notes, created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          FROM mdata.drivers
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return row;
  });

  app.patch("/api/v1/mdata/drivers/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateDriverBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const b = parsedBody.data;
    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };

    if ("identity_user_id" in b) add("identity_user_id", b.identity_user_id ?? null);
    if ("first_name" in b) add("first_name", b.first_name ?? null);
    if ("last_name" in b) add("last_name", b.last_name ?? null);
    if ("phone" in b) add("phone", b.phone ?? null);
    if ("email" in b) add("email", b.email ?? null);
    if ("cdl_number" in b) add("cdl_number", b.cdl_number ?? null);
    if ("cdl_state" in b) add("cdl_state", b.cdl_state ?? null);
    if ("cdl_class" in b) add("cdl_class", b.cdl_class ?? null);
    if ("cdl_expires_at" in b) add("cdl_expires_at", b.cdl_expires_at ?? null);
    if ("hire_date" in b) add("hire_date", b.hire_date ?? null);
    if ("dot_medical_expires_at" in b) add("dot_medical_expires_at", b.dot_medical_expires_at ?? null);
    if ("hazmat_endorsement_expires_at" in b) add("hazmat_endorsement_expires_at", b.hazmat_endorsement_expires_at ?? null);
    if ("status" in b) add("status", b.status);
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
              id, identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
              cdl_expires_at, hire_date, termination_date, dot_medical_expires_at, hazmat_endorsement_expires_at,
              status, notes, created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
            FROM mdata.drivers
            WHERE id = $1
            LIMIT 1
          `,
          [parsedParams.data.id]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE mdata.drivers
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx}
            RETURNING
              id, identity_user_id, first_name, last_name, phone, email, cdl_number, cdl_state, cdl_class,
              cdl_expires_at, hire_date, termination_date, dot_medical_expires_at, hazmat_endorsement_expires_at,
              status, notes, created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          `,
          values
        );
        const updatedRow = res.rows[0] ?? null;
        if (!updatedRow) return null;

        const oldStatus = String(oldRow.status ?? "");
        const newStatus = String(updatedRow.status ?? oldStatus);
        const identityUserId = (updatedRow.identity_user_id as string | null) ?? (oldRow.identity_user_id as string | null);
        if (identityUserId && !statusDisablesDriverLogin(oldStatus) && statusDisablesDriverLogin(newStatus)) {
          const identityDeactivateRes = await client.query<{ deactivated_at: string | null }>(
            `
              UPDATE identity.users
              SET deactivated_at = now()
              WHERE id = $1
                AND deactivated_at IS NULL
              RETURNING deactivated_at
            `,
            [identityUserId]
          );
          if (identityDeactivateRes.rows.length > 0) {
            await appendCrudAudit(
              client,
              authUser.uuid,
              "identity.users.deactivated_via_driver_deactivation",
              {
                resource_id: identityUserId,
                resource_type: "identity.users",
                driver_id: updatedRow.id,
                driver_status_from: oldStatus,
                driver_status_to: newStatus,
              },
              "warning",
              "BT-1-AUTH-DRIVER"
            );
          }
        }

        const changes = buildPatchChanges(
          b as unknown as Record<string, unknown>,
          oldRow as Record<string, unknown>,
          updatedRow as Record<string, unknown>
        );
        await appendCrudAudit(client, authUser.uuid, "mdata.drivers.updated", {
          resource_id: updatedRow.id,
          resource_type: "mdata.drivers",
          changes,
        });
        return updatedRow;
      });
      if (!updated) return reply.code(404).send({ error: "mdata_driver_not_found" });
      return updated;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "mdata_driver_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_identity_user_id" });
      throw err;
    }
  });

  app.post("/api/v1/mdata/drivers/:id/deactivate", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const deactivated = await withCurrentUser(authUser.uuid, async (client) => {
      const oldRes = await client.query(
        `
          SELECT id, deactivated_at, identity_user_id, status
          FROM mdata.drivers
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
            UPDATE mdata.drivers
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

      const identityUserId = oldRow.identity_user_id as string | null;
      if (identityUserId) {
        const identityDeactivateRes = await client.query<{ deactivated_at: string | null }>(
          `
            UPDATE identity.users
            SET deactivated_at = now()
            WHERE id = $1
              AND deactivated_at IS NULL
            RETURNING deactivated_at
          `,
          [identityUserId]
        );
        if (identityDeactivateRes.rows.length > 0) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "identity.users.deactivated_via_driver_deactivation",
            {
              resource_id: identityUserId,
              resource_type: "identity.users",
              driver_id: oldRow.id,
              driver_status: oldRow.status,
            },
            "warning",
            "BT-1-AUTH-DRIVER"
          );
        }
      }

      await appendCrudAudit(client, authUser.uuid, "mdata.drivers.deactivated", {
        resource_id: oldRow.id,
        resource_type: "mdata.drivers",
        was_already_deactivated: wasAlreadyDeactivated,
      });

      return { id: oldRow.id, deactivated_at: deactivatedAt, was_already_deactivated: wasAlreadyDeactivated };
    });
    if (!deactivated) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return deactivated;
  });

  app.post("/api/v1/mdata/drivers/:id/enable-phone-login", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const driverRes = await client.query<{ id: string; phone: string; identity_user_id: string | null }>(
          `
            SELECT id, phone, identity_user_id
            FROM mdata.drivers
            WHERE id = $1
            LIMIT 1
          `,
          [parsedParams.data.id]
        );
        const driver = driverRes.rows[0];
        if (!driver) return { error: "mdata_driver_not_found" as const };
        if (driver.identity_user_id) return { error: "driver_phone_login_already_enabled" as const };

        const userRes = await client.query<{ id: string }>(
          `
            INSERT INTO identity.users (email, role, phone)
            VALUES (NULL, 'Driver', $1)
            RETURNING id
          `,
          [driver.phone]
        );
        const identityUserId = userRes.rows[0]?.id;
        if (!identityUserId) return { error: "identity_user_create_failed" as const };

        await client.query(`UPDATE mdata.drivers SET identity_user_id = $2, updated_by_user_id = $3 WHERE id = $1`, [
          driver.id,
          identityUserId,
          authUser.uuid,
        ]);

        await appendCrudAudit(
          client,
          authUser.uuid,
          "identity.users.created",
          {
            resource_id: identityUserId,
            resource_type: "identity.users",
            role: "Driver",
            phone: driver.phone,
            linked_driver_id: driver.id,
          },
          "warning",
          "BT-1-AUTH-DRIVER"
        );

        return { identity_user_id: identityUserId };
      });

      if ("error" in updated) {
        if (updated.error === "mdata_driver_not_found") return reply.code(404).send({ error: updated.error });
        if (updated.error === "driver_phone_login_already_enabled") return reply.code(409).send({ error: updated.error });
        return reply.code(400).send({ error: updated.error });
      }

      return { ok: true, ...updated };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "identity_user_phone_conflict" });
      throw err;
    }
  });

  app.post("/api/v1/mdata/drivers/:id/disable-phone-login", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const driverRes = await client.query<{ id: string; identity_user_id: string | null }>(
        `
          SELECT id, identity_user_id
          FROM mdata.drivers
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      const driver = driverRes.rows[0];
      if (!driver) return { error: "mdata_driver_not_found" as const };
      if (!driver.identity_user_id) return { error: "driver_phone_login_not_enabled" as const };

      const deactivateRes = await client.query<{ deactivated_at: string | null }>(
        `
          UPDATE identity.users
          SET deactivated_at = now()
          WHERE id = $1
            AND deactivated_at IS NULL
          RETURNING deactivated_at
        `,
        [driver.identity_user_id]
      );
      const changed = deactivateRes.rows.length > 0;
      if (changed) {
        await appendCrudAudit(
          client,
          authUser.uuid,
          "identity.users.deactivated",
          {
            resource_id: driver.identity_user_id,
            resource_type: "identity.users",
            driver_id: driver.id,
            reason: "manual_phone_login_disable",
          },
          "warning",
          "BT-1-AUTH-DRIVER"
        );
      }
      return { identity_user_id: driver.identity_user_id, changed };
    });

    if ("error" in result) {
      if (result.error === "mdata_driver_not_found") return reply.code(404).send({ error: result.error });
      return reply.code(409).send({ error: result.error });
    }

    return { ok: true, ...result };
  });
}
