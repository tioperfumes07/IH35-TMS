import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const lineItemUnitSchema = z.enum([
  "per_loaded_mile",
  "per_empty_mile",
  "per_total_mile",
  "flat_per_occurrence",
  "flat_per_load",
  "percent_of_load_revenue",
  "flat_per_hour",
]);

const idParamSchema = z.object({ id: z.string().uuid() });

const listQuerySchema = z.object({
  include_inactive: z.enum(["true", "false"]).optional(),
});

const createEquipmentTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]+$/, "code must be uppercase letters/digits/underscores")
    .min(2)
    .max(40),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  sort_order: z.number().int().min(0).max(10000).default(100),
  line_items: z
    .array(
      z.object({
        code: z
          .string()
          .trim()
          .regex(/^[A-Z][A-Z0-9_]+$/, "code must be uppercase letters/digits/underscores")
          .min(2)
          .max(40),
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(500).optional(),
        unit: lineItemUnitSchema,
        sort_order: z.number().int().min(0).max(10000).default(100),
        is_required: z.boolean().default(false),
      })
    )
    .min(1, "must define at least one line item"),
});

const updateEquipmentTypeSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  sort_order: z.number().int().min(0).max(10000).optional(),
  is_active: z.boolean().optional(),
});

const createLineItemTemplateSchema = z.object({
  code: z.string().trim().regex(/^[A-Z][A-Z0-9_]+$/).min(2).max(40),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  unit: lineItemUnitSchema,
  sort_order: z.number().int().min(0).max(10000).default(100),
  is_required: z.boolean().default(false),
});

const updateLineItemTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  unit: lineItemUnitSchema.optional(),
  sort_order: z.number().int().min(0).max(10000).optional(),
  is_required: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

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

export async function registerEquipmentTypeRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/equipment-types", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const includeInactive = parsedQuery.data.include_inactive === "true";

    return withCurrentUser(user.uuid, async (client) => {
      const filter = includeInactive ? "" : "WHERE et.is_active = true AND et.deactivated_at IS NULL";
      const res = await client.query(
        `
          SELECT
            et.id, et.code, et.name, et.description, et.is_active, et.sort_order,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', lit.id,
                  'code', lit.code,
                  'name', lit.name,
                  'description', lit.description,
                  'unit', lit.unit,
                  'sort_order', lit.sort_order,
                  'is_required', lit.is_required,
                  'is_active', lit.is_active
                ) ORDER BY lit.sort_order
              ) FILTER (WHERE lit.id IS NOT NULL AND lit.deactivated_at IS NULL AND lit.is_active = true),
              '[]'::json
            ) AS line_items
          FROM catalogs.equipment_types et
          LEFT JOIN catalogs.equipment_line_item_templates lit ON lit.equipment_type_id = et.id
          ${filter}
          GROUP BY et.id
          ORDER BY et.sort_order, et.name
        `
      );
      return { equipment_types: res.rows };
    });
  });

  app.get<{ Params: { id: string } }>("/api/v1/catalogs/equipment-types/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = idParamSchema.safeParse(req.params);
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    return withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            et.id, et.code, et.name, et.description, et.is_active, et.sort_order,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', lit.id,
                  'code', lit.code,
                  'name', lit.name,
                  'description', lit.description,
                  'unit', lit.unit,
                  'sort_order', lit.sort_order,
                  'is_required', lit.is_required,
                  'is_active', lit.is_active
                ) ORDER BY lit.sort_order
              ) FILTER (WHERE lit.id IS NOT NULL AND lit.deactivated_at IS NULL),
              '[]'::json
            ) AS line_items
          FROM catalogs.equipment_types et
          LEFT JOIN catalogs.equipment_line_item_templates lit ON lit.equipment_type_id = et.id
          WHERE et.id = $1
            AND et.deactivated_at IS NULL
          GROUP BY et.id
        `,
        [parsed.data.id]
      );
      if (res.rows.length === 0) return reply.code(404).send({ error: "not_found" });
      return { equipment_type: res.rows[0] };
    });
  });

  app.post("/api/v1/catalogs/equipment-types", async (req, reply) => {
    const user = ensureAdmin(req, reply);
    if (!user) return;
    const parsed = createEquipmentTypeSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    return withCurrentUser(user.uuid, async (client) => {
      try {
        const insertEq = await client.query(
          `
            INSERT INTO catalogs.equipment_types (code, name, description, sort_order, created_by_user_id, updated_by_user_id)
            VALUES ($1, $2, $3, $4, $5, $5)
            RETURNING id
          `,
          [parsed.data.code, parsed.data.name, parsed.data.description ?? null, parsed.data.sort_order, user.uuid]
        );
        const newId = String(insertEq.rows[0].id);

        for (const item of parsed.data.line_items) {
          await client.query(
            `
              INSERT INTO catalogs.equipment_line_item_templates (
                equipment_type_id, code, name, description, unit, sort_order, is_required, created_by_user_id, updated_by_user_id
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
            `,
            [newId, item.code, item.name, item.description ?? null, item.unit, item.sort_order, item.is_required, user.uuid]
          );
        }

        await appendCrudAudit(
          client,
          user.uuid,
          "catalogs.equipment_types.created",
          {
            resource_id: newId,
            resource_type: "catalogs.equipment_types",
            code: parsed.data.code,
            line_item_count: parsed.data.line_items.length,
          },
          "info",
          "BT-1-EQUIPMENT-CATALOG"
        );

        return reply.code(201).send({ id: newId });
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "23505") return reply.code(409).send({ error: "equipment_type_code_conflict" });
        throw err;
      }
    });
  });

  app.patch<{ Params: { id: string } }>("/api/v1/catalogs/equipment-types/:id", async (req, reply) => {
    const user = ensureAdmin(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateEquipmentTypeSchema.safeParse(req.body ?? {});
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
      if (fields.length === 0) return reply.code(400).send({ error: "no_fields_to_update" });
      fields.push("updated_at = now()");
      values.push(user.uuid);
      fields.push(`updated_by_user_id = $${values.length}`);
      values.push(parsedParams.data.id);
      const res = await client.query(
        `UPDATE catalogs.equipment_types SET ${fields.join(", ")} WHERE id = $${values.length} RETURNING id`,
        values
      );
      if (res.rows.length === 0) return reply.code(404).send({ error: "not_found" });
      await appendCrudAudit(
        client,
        user.uuid,
        "catalogs.equipment_types.updated",
        {
          resource_id: parsedParams.data.id,
          resource_type: "catalogs.equipment_types",
          changes: parsedBody.data,
        },
        "info",
        "BT-1-EQUIPMENT-CATALOG"
      );
      return { ok: true };
    });
  });

  app.post<{ Params: { id: string } }>("/api/v1/catalogs/equipment-types/:id/line-items", async (req, reply) => {
    const user = ensureAdmin(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = createLineItemTemplateSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    return withCurrentUser(user.uuid, async (client) => {
      try {
        const res = await client.query(
          `
            INSERT INTO catalogs.equipment_line_item_templates (
              equipment_type_id, code, name, description, unit, sort_order, is_required, created_by_user_id, updated_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
            RETURNING id
          `,
          [
            parsedParams.data.id,
            parsedBody.data.code,
            parsedBody.data.name,
            parsedBody.data.description ?? null,
            parsedBody.data.unit,
            parsedBody.data.sort_order,
            parsedBody.data.is_required,
            user.uuid,
          ]
        );
        const lineItemId = String(res.rows[0].id);
        await appendCrudAudit(
          client,
          user.uuid,
          "catalogs.equipment_line_item_templates.created",
          {
            resource_id: lineItemId,
            resource_type: "catalogs.equipment_line_item_templates",
            equipment_type_id: parsedParams.data.id,
            code: parsedBody.data.code,
          },
          "info",
          "BT-1-EQUIPMENT-CATALOG"
        );
        return reply.code(201).send({ id: lineItemId });
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "23505") return reply.code(409).send({ error: "line_item_code_conflict" });
        if (code === "23503") return reply.code(404).send({ error: "equipment_type_not_found" });
        throw err;
      }
    });
  });

  app.patch<{ Params: { id: string } }>("/api/v1/catalogs/equipment-line-items/:id", async (req, reply) => {
    const user = ensureAdmin(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params);
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateLineItemTemplateSchema.safeParse(req.body ?? {});
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
      if (fields.length === 0) return reply.code(400).send({ error: "no_fields_to_update" });
      fields.push("updated_at = now()");
      values.push(user.uuid);
      fields.push(`updated_by_user_id = $${values.length}`);
      values.push(parsedParams.data.id);
      const res = await client.query(
        `UPDATE catalogs.equipment_line_item_templates SET ${fields.join(", ")} WHERE id = $${values.length} RETURNING id`,
        values
      );
      if (res.rows.length === 0) return reply.code(404).send({ error: "not_found" });
      await appendCrudAudit(
        client,
        user.uuid,
        "catalogs.equipment_line_item_templates.updated",
        {
          resource_id: parsedParams.data.id,
          resource_type: "catalogs.equipment_line_item_templates",
          changes: parsedBody.data,
        },
        "info",
        "BT-1-EQUIPMENT-CATALOG"
      );
      return { ok: true };
    });
  });
}
