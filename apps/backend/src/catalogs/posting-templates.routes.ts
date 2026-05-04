import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { isCatalogWriteRole } from "../auth/role-helpers.js";
import { requireAuth } from "../auth/session-middleware.js";

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(["active", "inactive"]).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const createBodySchema = z.object({
  template_name: z.string().trim().min(1).max(200),
  template_code: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
  debit_account_id: z.string().uuid(),
  credit_account_id: z.string().uuid(),
  default_class_id: z.string().uuid().optional(),
  default_memo: z.string().trim().max(1000).optional(),
  is_active: z.boolean().default(true),
});

const updateBodySchema = z
  .object({
    template_name: z.string().trim().min(1).max(200).optional(),
    template_code: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    debit_account_id: z.string().uuid().optional(),
    credit_account_id: z.string().uuid().optional(),
    default_class_id: z.string().uuid().nullable().optional(),
    default_memo: z.string().trim().max(1000).nullable().optional(),
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

function mapConflict(constraint?: string): string {
  if (!constraint) return "catalog_posting_template_conflict";
  if (constraint.includes("template_name")) return "catalog_posting_template_conflict_template_name";
  if (constraint.includes("template_code")) return "catalog_posting_template_conflict_template_code";
  return "catalog_posting_template_conflict";
}

export async function registerPostingTemplateRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/posting-templates", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const { limit, offset, status, search } = parsed.data;

    const posting_templates = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [];
      if (status === "active") filters.push("is_active = true");
      if (status === "inactive") filters.push("is_active = false");
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(`(template_name ILIKE $${idx} OR template_code ILIKE $${idx})`);
      }
      values.push(limit);
      values.push(offset);
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT
            id, template_name, template_code, description, debit_account_id, credit_account_id,
            default_class_id, default_memo, is_active,
            created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          FROM catalogs.posting_templates
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows;
    });

    return { posting_templates };
  });

  app.post("/api/v1/catalogs/posting-templates", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = createBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const b = parsed.data;

    if (b.debit_account_id === b.credit_account_id) {
      return reply.code(400).send({ error: "debit_credit_must_differ" });
    }

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const res = await client.query(
          `
            INSERT INTO catalogs.posting_templates (
              template_name, template_code, description, debit_account_id, credit_account_id,
              default_class_id, default_memo, is_active, created_by_user_id, updated_by_user_id
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$9
            )
            RETURNING
              id, template_name, template_code, description, debit_account_id, credit_account_id,
              default_class_id, default_memo, is_active,
              created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          `,
          [
            b.template_name,
            b.template_code,
            b.description ?? null,
            b.debit_account_id,
            b.credit_account_id,
            b.default_class_id ?? null,
            b.default_memo ?? null,
            b.is_active,
            authUser.uuid,
          ]
        );
        const row = res.rows[0];
        await appendCrudAudit(client, authUser.uuid, "catalogs.posting_templates.created", {
          resource_id: row.id,
          resource_type: "catalogs.posting_templates",
          id: row.id,
          template_name: row.template_name,
          template_code: row.template_code,
          is_active: row.is_active,
        });
        return row;
      });
      return reply.code(201).send(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      const constraint = (err as { constraint?: string }).constraint;
      if (code === "23505") return reply.code(409).send({ error: mapConflict(constraint), field: constraint ?? null });
      if (code === "23503") return reply.code(400).send({ error: "invalid_account_or_class_reference" });
      throw err;
    }
  });

  app.get("/api/v1/catalogs/posting-templates/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            id, template_name, template_code, description, debit_account_id, credit_account_id,
            default_class_id, default_memo, is_active,
            created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          FROM catalogs.posting_templates
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "catalog_posting_template_not_found" });
    return row;
  });

  app.patch("/api/v1/catalogs/posting-templates/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };
    if ("template_name" in b) add("template_name", b.template_name ?? null);
    if ("template_code" in b) add("template_code", b.template_code ?? null);
    if ("description" in b) add("description", b.description ?? null);
    if ("debit_account_id" in b) add("debit_account_id", b.debit_account_id ?? null);
    if ("credit_account_id" in b) add("credit_account_id", b.credit_account_id ?? null);
    if ("default_class_id" in b) add("default_class_id", b.default_class_id ?? null);
    if ("default_memo" in b) add("default_memo", b.default_memo ?? null);
    if ("is_active" in b) add("is_active", b.is_active);
    add("updated_by_user_id", authUser.uuid);
    values.push(parsedParams.data.id);
    const idIdx = values.length;

    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const oldRes = await client.query(
          `
            SELECT
              id, template_name, template_code, description, debit_account_id, credit_account_id,
              default_class_id, default_memo, is_active,
              created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
            FROM catalogs.posting_templates
            WHERE id = $1
            LIMIT 1
          `,
          [parsedParams.data.id]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;
        const finalDebit = b.debit_account_id ?? String(oldRow.debit_account_id);
        const finalCredit = b.credit_account_id ?? String(oldRow.credit_account_id);
        if (finalDebit === finalCredit) {
          return { error: "debit_credit_must_differ" as const };
        }

        const res = await client.query(
          `
            UPDATE catalogs.posting_templates
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx}
            RETURNING
              id, template_name, template_code, description, debit_account_id, credit_account_id,
              default_class_id, default_memo, is_active,
              created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
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
        const isActiveChanged = Object.prototype.hasOwnProperty.call(changes, "is_active");
        const isActiveChangedFrom = oldRow.is_active;
        const isActiveChangedTo = updatedRow.is_active;
        await appendCrudAudit(
          client,
          authUser.uuid,
          "catalogs.posting_templates.updated",
          {
            resource_id: updatedRow.id,
            resource_type: "catalogs.posting_templates",
            changes,
            ...(isActiveChanged
              ? {
                  is_active_changed_from: isActiveChangedFrom,
                  is_active_changed_to: isActiveChangedTo,
                }
              : {}),
          },
          isActiveChanged && isActiveChangedFrom === true && isActiveChangedTo === false ? "warning" : "info"
        );
        return { row: updatedRow };
      });
      if (!updated) return reply.code(404).send({ error: "catalog_posting_template_not_found" });
      if ("error" in updated) return reply.code(400).send({ error: updated.error });
      return updated.row;
    } catch (err) {
      const code = (err as { code?: string }).code;
      const constraint = (err as { constraint?: string }).constraint;
      if (code === "23505") return reply.code(409).send({ error: mapConflict(constraint), field: constraint ?? null });
      if (code === "23503") return reply.code(400).send({ error: "invalid_account_or_class_reference" });
      throw err;
    }
  });

  app.post("/api/v1/catalogs/posting-templates/:id/deactivate", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const deactivated = await withCurrentUser(authUser.uuid, async (client) => {
      const oldRes = await client.query(
        `
          SELECT id, is_active
          FROM catalogs.posting_templates
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      const oldRow = oldRes.rows[0] ?? null;
      if (!oldRow) return null;

      let isActive = Boolean(oldRow.is_active);
      const wasAlreadyDeactivated = !isActive;
      if (!wasAlreadyDeactivated) {
        const res = await client.query(
          `
            UPDATE catalogs.posting_templates
            SET is_active = false, updated_by_user_id = $2
            WHERE id = $1
            RETURNING id, is_active
          `,
          [parsedParams.data.id, authUser.uuid]
        );
        isActive = Boolean(res.rows[0]?.is_active ?? false);
      }

      await appendCrudAudit(
        client,
        authUser.uuid,
        "catalogs.posting_templates.is_active_changed",
        {
          resource_id: oldRow.id,
          resource_type: "catalogs.posting_templates",
          was_already_deactivated: wasAlreadyDeactivated,
          is_active_from: oldRow.is_active,
          is_active_to: false,
        },
        "warning"
      );

      return { id: oldRow.id, is_active: isActive, was_already_deactivated: wasAlreadyDeactivated };
    });
    if (!deactivated) return reply.code(404).send({ error: "catalog_posting_template_not_found" });
    return deactivated;
  });
}
