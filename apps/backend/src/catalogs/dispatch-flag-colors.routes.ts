import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const hexColorSchema = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "hex_color must be #RRGGBB");
const idParamSchema = z.object({ id: z.string().uuid() });

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
  include_inactive: z.enum(["true", "false"]).optional(),
});

const createFlagColorSchema = z.object({
  operating_company_id: z.string().uuid(),
  flag_code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]+$/, "flag_code must be uppercase letters/digits/underscores")
    .min(2)
    .max(40),
  display_name: z.string().trim().min(1).max(120),
  hex_color: hexColorSchema,
  icon_emoji: z.string().trim().max(20).optional(),
  severity_order: z.number().int().min(0).max(100).default(50),
  description: z.string().trim().max(500).optional(),
  sort_order: z.number().int().min(0).max(10000).default(100),
});

const updateFlagColorSchema = z
  .object({
    flag_code: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]+$/, "flag_code must be uppercase letters/digits/underscores")
      .min(2)
      .max(40)
      .optional(),
    display_name: z.string().trim().min(1).max(120).optional(),
    hex_color: hexColorSchema.optional(),
    icon_emoji: z.string().trim().max(20).nullable().optional(),
    severity_order: z.number().int().min(0).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    sort_order: z.number().int().min(0).max(10000).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
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

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function resolveCompanyId(
  client: { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> },
  userId: string,
  requested?: string
) {
  if (requested) return requested;
  const res = await client.query<{ id: string }>(
    `
      SELECT c.id
      FROM identity.users u
      JOIN org.companies c ON c.id = u.default_company_id
      WHERE u.id = $1
        AND c.id IN (SELECT org.user_accessible_company_ids())
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

export async function registerDispatchFlagColorRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/dispatch-flag-colors", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const rows = await withCurrentUser(user.uuid, async (client) => {
      const companyId = await resolveCompanyId(client, user.uuid, parsedQuery.data.operating_company_id);
      if (!companyId) return [];
      const values: unknown[] = [companyId];
      const filters: string[] = [`operating_company_id = $1`];
      if (parsedQuery.data.include_inactive !== "true") {
        filters.push("is_active = true");
      }
      const whereClause = `WHERE ${filters.join(" AND ")}`;
      const res = await client.query(
        `
          SELECT
            id, operating_company_id, flag_code, display_name, hex_color, icon_emoji,
            severity_order, description, is_active, sort_order, created_at, updated_at, created_by_user_id
          FROM catalogs.dispatch_flag_colors
          ${whereClause}
          ORDER BY sort_order, severity_order, display_name
        `,
        values
      );
      return res.rows;
    });

    return { flags: rows };
  });

  app.post("/api/v1/catalogs/dispatch-flag-colors", async (req, reply) => {
    const user = ensureAdmin(req, reply);
    if (!user) return;
    const parsedBody = createFlagColorSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    try {
      const created = await withCurrentUser(user.uuid, async (client) => {
        const res = await client.query(
          `
            INSERT INTO catalogs.dispatch_flag_colors (
              operating_company_id, flag_code, display_name, hex_color, icon_emoji, severity_order, description, sort_order, created_by_user_id
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9
            )
            RETURNING
              id, operating_company_id, flag_code, display_name, hex_color, icon_emoji,
              severity_order, description, is_active, sort_order, created_at, updated_at, created_by_user_id
          `,
          [
            b.operating_company_id,
            b.flag_code,
            b.display_name,
            b.hex_color,
            b.icon_emoji ?? null,
            b.severity_order,
            b.description ?? null,
            b.sort_order,
            user.uuid,
          ]
        );
        const row = res.rows[0];
        await appendCrudAudit(
          client,
          user.uuid,
          "catalogs.dispatch_flag_color.created",
          {
            resource_id: row.id,
            resource_type: "catalogs.dispatch_flag_colors",
            flag_code: row.flag_code,
            operating_company_id: row.operating_company_id,
            severity_order: row.severity_order,
          },
          "info",
          "BT-3-FLAG-COLORS"
        );
        return row;
      });
      return reply.code(201).send({ flag: created });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "dispatch_flag_color_conflict" });
      if (code === "23514") return reply.code(400).send({ error: "dispatch_flag_color_constraint_violation" });
      throw error;
    }
  });

  app.patch("/api/v1/catalogs/dispatch-flag-colors/:id", async (req, reply) => {
    const user = ensureAdmin(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateFlagColorSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown) => {
      values.push(value);
      fields.push(`${column} = $${values.length}`);
    };
    if ("flag_code" in b) add("flag_code", b.flag_code);
    if ("display_name" in b) add("display_name", b.display_name);
    if ("hex_color" in b) add("hex_color", b.hex_color);
    if ("icon_emoji" in b) add("icon_emoji", b.icon_emoji ?? null);
    if ("severity_order" in b) add("severity_order", b.severity_order);
    if ("description" in b) add("description", b.description ?? null);
    if ("is_active" in b) add("is_active", b.is_active);
    if ("sort_order" in b) add("sort_order", b.sort_order);
    values.push(parsedParams.data.id);

    try {
      const updated = await withCurrentUser(user.uuid, async (client) => {
        const oldRes = await client.query(
          `
            SELECT
              id, operating_company_id, flag_code, display_name, hex_color, icon_emoji, severity_order, description, is_active, sort_order,
              created_at, updated_at, created_by_user_id
            FROM catalogs.dispatch_flag_colors
            WHERE id = $1
            LIMIT 1
          `,
          [parsedParams.data.id]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;
        const res = await client.query(
          `
            UPDATE catalogs.dispatch_flag_colors
            SET ${fields.join(", ")}
            WHERE id = $${values.length}
            RETURNING
              id, operating_company_id, flag_code, display_name, hex_color, icon_emoji, severity_order, description, is_active, sort_order,
              created_at, updated_at, created_by_user_id
          `,
          values
        );
        const row = res.rows[0] ?? null;
        if (!row) return null;
        const changes = buildPatchChanges(
          b as unknown as Record<string, unknown>,
          oldRow as Record<string, unknown>,
          row as Record<string, unknown>
        );
        await appendCrudAudit(
          client,
          user.uuid,
          "catalogs.dispatch_flag_color.updated",
          {
            resource_id: row.id,
            resource_type: "catalogs.dispatch_flag_colors",
            changes,
          },
          "info",
          "BT-3-FLAG-COLORS"
        );
        return row;
      });
      if (!updated) return reply.code(404).send({ error: "not_found" });
      return { flag: updated };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "dispatch_flag_color_conflict" });
      if (code === "23514") return reply.code(400).send({ error: "dispatch_flag_color_constraint_violation" });
      throw error;
    }
  });

  app.post("/api/v1/catalogs/dispatch-flag-colors/:id/deactivate", async (req, reply) => {
    const user = ensureAdmin(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const updated = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE catalogs.dispatch_flag_colors
          SET is_active = false
          WHERE id = $1
          RETURNING
            id, operating_company_id, flag_code, display_name, hex_color, icon_emoji, severity_order, description, is_active, sort_order,
            created_at, updated_at, created_by_user_id
        `,
        [parsedParams.data.id]
      );
      const row = res.rows[0] ?? null;
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "catalogs.dispatch_flag_color.deactivated",
        {
          resource_id: row.id,
          resource_type: "catalogs.dispatch_flag_colors",
          flag_code: row.flag_code,
          operating_company_id: row.operating_company_id,
        },
        "warning",
        "BT-3-FLAG-COLORS"
      );
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "not_found" });
    return { flag: updated };
  });

  app.post("/api/v1/catalogs/dispatch-flag-colors/:id/reactivate", async (req, reply) => {
    const user = ensureAdmin(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const updated = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE catalogs.dispatch_flag_colors
          SET is_active = true
          WHERE id = $1
          RETURNING
            id, operating_company_id, flag_code, display_name, hex_color, icon_emoji, severity_order, description, is_active, sort_order,
            created_at, updated_at, created_by_user_id
        `,
        [parsedParams.data.id]
      );
      const row = res.rows[0] ?? null;
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "catalogs.dispatch_flag_color.updated",
        {
          resource_id: row.id,
          resource_type: "catalogs.dispatch_flag_colors",
          changes: { is_active: true },
        },
        "info",
        "BT-3-FLAG-COLORS"
      );
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "not_found" });
    return { flag: updated };
  });
}
