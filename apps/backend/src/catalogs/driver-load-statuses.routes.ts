import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const phaseSchema = z.enum([
  "pickup",
  "transit_to_pickup",
  "at_pickup",
  "transit_to_delivery",
  "at_delivery",
  "completed",
  "other",
]);

const listQuerySchema = z.object({
  include_inactive: z.enum(["true", "false"]).optional(),
});

const createDriverLoadStatusSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]+$/, "code must be uppercase letters/digits/underscores")
    .min(2)
    .max(60),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  phase: phaseSchema,
  sort_order: z.number().int().min(0).max(10000).default(100),
});

const updateDriverLoadStatusSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    phase: phaseSchema.optional(),
    sort_order: z.number().int().min(0).max(10000).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function ensureAdmin(req: FastifyRequest, reply: FastifyReply) {
  const user = currentAuthUser(req, reply);
  if (!user) return null;
  if (!["Owner", "Administrator"].includes(user.role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

export async function registerDriverLoadStatusRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/driver-load-statuses", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    return withCurrentUser(user.uuid, async (client) => {
      const includeInactive = parsedQuery.data.include_inactive === "true";
      const filter = includeInactive ? "" : "WHERE deactivated_at IS NULL AND is_active = true";
      const res = await client.query(
        `
          SELECT
            id,
            code,
            name,
            description,
            phase,
            sort_order,
            is_active,
            deactivated_at,
            created_at,
            updated_at,
            created_by_user_id,
            updated_by_user_id
          FROM catalogs.driver_load_statuses
          ${filter}
          ORDER BY phase, sort_order, name
        `
      );
      return { statuses: res.rows };
    });
  });

  app.post("/api/v1/catalogs/driver-load-statuses", async (req, reply) => {
    const user = ensureAdmin(req, reply);
    if (!user) return;
    const parsedBody = createDriverLoadStatusSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    try {
      return await withCurrentUser(user.uuid, async (client) => {
        const res = await client.query(
          `
            INSERT INTO catalogs.driver_load_statuses (
              code, name, description, phase, sort_order, created_by_user_id, updated_by_user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $6)
            RETURNING id, code, name, description, phase, sort_order, is_active, deactivated_at, created_at, updated_at
          `,
          [
            parsedBody.data.code,
            parsedBody.data.name,
            parsedBody.data.description ?? null,
            parsedBody.data.phase,
            parsedBody.data.sort_order,
            user.uuid,
          ]
        );
        const row = res.rows[0];
        await appendCrudAudit(
          client,
          user.uuid,
          "catalogs.driver_load_statuses.created",
          {
            resource_id: row.id,
            resource_type: "catalogs.driver_load_statuses",
            code: row.code,
            phase: row.phase,
          },
          "info",
          "BT-1-CUST-DRIVER-FIELDS"
        );
        return reply.code(201).send({ status: row });
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        return reply.code(409).send({ error: "driver_load_status_code_conflict" });
      }
      throw error;
    }
  });

  app.patch<{ Params: { id: string } }>("/api/v1/catalogs/driver-load-statuses/:id", async (req, reply) => {
    const user = ensureAdmin(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateDriverLoadStatusSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    return withCurrentUser(user.uuid, async (client) => {
      const fields: string[] = [];
      const values: unknown[] = [];
      for (const [key, value] of Object.entries(parsedBody.data)) {
        if (value !== undefined) {
          values.push(value);
          fields.push(`${key} = $${values.length}`);
        }
      }

      if ("is_active" in parsedBody.data) {
        const deactivatedAtValue = parsedBody.data.is_active ? null : new Date().toISOString();
        values.push(deactivatedAtValue);
        fields.push(`deactivated_at = $${values.length}`);
      }

      fields.push("updated_at = now()");
      values.push(user.uuid);
      fields.push(`updated_by_user_id = $${values.length}`);
      values.push(parsedParams.data.id);

      try {
        const res = await client.query(
          `
            UPDATE catalogs.driver_load_statuses
            SET ${fields.join(", ")}
            WHERE id = $${values.length}
            RETURNING id, code, name, description, phase, sort_order, is_active, deactivated_at, created_at, updated_at
          `,
          values
        );
        if (res.rows.length === 0) return reply.code(404).send({ error: "not_found" });
        const row = res.rows[0];
        await appendCrudAudit(
          client,
          user.uuid,
          "catalogs.driver_load_statuses.updated",
          {
            resource_id: row.id,
            resource_type: "catalogs.driver_load_statuses",
            changes: parsedBody.data,
          },
          "info",
          "BT-1-CUST-DRIVER-FIELDS"
        );
        return { status: row };
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          return reply.code(409).send({ error: "driver_load_status_code_conflict" });
        }
        throw error;
      }
    });
  });
}
