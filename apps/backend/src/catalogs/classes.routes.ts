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
  parent_class_id: z.string().uuid().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const createBodySchema = z.object({
  class_name: z.string().trim().min(1).max(200),
  class_code: z.string().trim().max(100).optional(),
  parent_class_id: z.string().uuid().optional(),
  qbo_class_id: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const updateBodySchema = z
  .object({
    class_name: z.string().trim().min(1).max(200).optional(),
    class_code: z.string().trim().max(100).nullable().optional(),
    parent_class_id: z.string().uuid().nullable().optional(),
    qbo_class_id: z.string().trim().max(100).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    deactivated_at: z.string().datetime().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

// Block 7 — bulk edit: deactivate or re-parent the selected classes.
const bulkBodySchema = z.object({
  op: z.enum(["deactivate", "reparent"]),
  ids: z.array(z.string().uuid()).min(1).max(200),
  parent_class_id: z.string().uuid().nullable().optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function mapClassConflict(constraint?: string): string {
  if (!constraint) return "catalog_class_conflict";
  if (constraint.includes("class_name")) return "catalog_class_conflict_class_name";
  if (constraint.includes("class_code")) return "catalog_class_conflict_class_code";
  if (constraint.includes("qbo_class_id")) return "catalog_class_conflict_qbo_class_id";
  return "catalog_class_conflict";
}

export async function registerClassRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/classes", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const { limit, offset, status, search, parent_class_id } = parsed.data;

    const classes = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const filters: string[] = [];
      if (status === "active") filters.push("deactivated_at IS NULL");
      if (status === "inactive") filters.push("deactivated_at IS NOT NULL");
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(`(class_name ILIKE $${idx} OR class_code ILIKE $${idx})`);
      }
      if (parent_class_id) {
        values.push(parent_class_id);
        filters.push(`parent_class_id = $${values.length}`);
      }
      values.push(limit);
      values.push(offset);
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT
            id, class_name, class_code, parent_class_id, qbo_class_id, notes,
            created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          FROM catalogs.classes
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return res.rows;
    });

    return { classes };
  });

  app.post("/api/v1/catalogs/classes", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = createBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const b = parsed.data;

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const res = await client.query(
          `
            INSERT INTO catalogs.classes (
              class_name, class_code, parent_class_id, qbo_class_id, notes, created_by_user_id, updated_by_user_id
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$6
            )
            RETURNING
              id, class_name, class_code, parent_class_id, qbo_class_id, notes,
              created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          `,
          [b.class_name, b.class_code ?? null, b.parent_class_id ?? null, b.qbo_class_id ?? null, b.notes ?? null, authUser.uuid]
        );
        const row = res.rows[0];
        await appendCrudAudit(client, authUser.uuid, "catalogs.classes.created", {
          resource_id: row.id,
          resource_type: "catalogs.classes",
          id: row.id,
          class_name: row.class_name,
          class_code: row.class_code,
        });
        return row;
      });
      return reply.code(201).send(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      const constraint = (err as { constraint?: string }).constraint;
      if (code === "23505") return reply.code(409).send({ error: mapClassConflict(constraint), field: constraint ?? null });
      if (code === "23503") return reply.code(400).send({ error: "invalid_parent_class_id" });
      throw err;
    }
  });

  app.get("/api/v1/catalogs/classes/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            id, class_name, class_code, parent_class_id, qbo_class_id, notes,
            created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
          FROM catalogs.classes
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "catalog_class_not_found" });
    return row;
  });

  app.patch("/api/v1/catalogs/classes/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    if (b.parent_class_id && b.parent_class_id === parsedParams.data.id) {
      return reply.code(400).send({ error: "cannot_self_reference" });
    }

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };
    if ("class_name" in b) add("class_name", b.class_name ?? null);
    if ("class_code" in b) add("class_code", b.class_code ?? null);
    if ("parent_class_id" in b) add("parent_class_id", b.parent_class_id ?? null);
    if ("qbo_class_id" in b) add("qbo_class_id", b.qbo_class_id ?? null);
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
              id, class_name, class_code, parent_class_id, qbo_class_id, notes,
              created_at, updated_at, deactivated_at, created_by_user_id, updated_by_user_id
            FROM catalogs.classes
            WHERE id = $1
            LIMIT 1
          `,
          [parsedParams.data.id]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE catalogs.classes
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx}
            RETURNING
              id, class_name, class_code, parent_class_id, qbo_class_id, notes,
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
        await appendCrudAudit(client, authUser.uuid, "catalogs.classes.updated", {
          resource_id: updatedRow.id,
          resource_type: "catalogs.classes",
          changes,
        });
        return updatedRow;
      });
      if (!updated) return reply.code(404).send({ error: "catalog_class_not_found" });
      return updated;
    } catch (err) {
      const code = (err as { code?: string }).code;
      const constraint = (err as { constraint?: string }).constraint;
      if (code === "23505") return reply.code(409).send({ error: mapClassConflict(constraint), field: constraint ?? null });
      if (code === "23503") return reply.code(400).send({ error: "invalid_parent_class_id" });
      throw err;
    }
  });

  app.post("/api/v1/catalogs/classes/bulk", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = bulkBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const { op, ids, parent_class_id } = parsed.data;
    if (op === "reparent" && parent_class_id && ids.includes(parent_class_id)) {
      return reply.code(400).send({ error: "cannot_self_reference" });
    }
    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        let count = 0;
        for (const id of ids) {
          if (op === "deactivate") {
            const res = await client.query(
              `UPDATE catalogs.classes SET deactivated_at = now(), updated_by_user_id = $2
               WHERE id = $1 AND deactivated_at IS NULL RETURNING id`,
              [id, authUser.uuid]
            );
            if (res.rows[0]) {
              await appendCrudAudit(client, authUser.uuid, "catalogs.classes.updated", {
                resource_id: id,
                resource_type: "catalogs.classes",
                changes: { deactivated_at: { from: null, to: "now()" } },
                bulk_op: "deactivate",
              });
              count += 1;
            }
          } else {
            const res = await client.query(
              `UPDATE catalogs.classes SET parent_class_id = $2::uuid, updated_by_user_id = $3
               WHERE id = $1 RETURNING id`,
              [id, parent_class_id ?? null, authUser.uuid]
            );
            if (res.rows[0]) {
              await appendCrudAudit(client, authUser.uuid, "catalogs.classes.updated", {
                resource_id: id,
                resource_type: "catalogs.classes",
                changes: { parent_class_id: { to: parent_class_id ?? null } },
                bulk_op: "reparent",
              });
              count += 1;
            }
          }
        }
        return count;
      });
      return { updated };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23503") return reply.code(400).send({ error: "invalid_parent_class_id" });
      throw err;
    }
  });

  app.post("/api/v1/catalogs/classes/:id/deactivate", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const deactivated = await withCurrentUser(authUser.uuid, async (client) => {
      const oldRes = await client.query(
        `
          SELECT id, deactivated_at
          FROM catalogs.classes
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
            UPDATE catalogs.classes
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

      await appendCrudAudit(client, authUser.uuid, "catalogs.classes.deactivated", {
        resource_id: oldRow.id,
        resource_type: "catalogs.classes",
        was_already_deactivated: wasAlreadyDeactivated,
      });

      return { id: oldRow.id, deactivated_at: deactivatedAt, was_already_deactivated: wasAlreadyDeactivated };
    });
    if (!deactivated) return reply.code(404).send({ error: "catalog_class_not_found" });
    return deactivated;
  });
}
