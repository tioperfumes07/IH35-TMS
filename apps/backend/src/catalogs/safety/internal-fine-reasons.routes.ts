import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { isCatalogWriteRole } from "../../auth/role-helpers.js";
import { catalogCodeSchema, currentAuthUser, idParamSchema, listQuerySchema, validationError, withCompanyScope } from "./shared.js";

const createBodySchema = z.object({
  reason_code: catalogCodeSchema,
  reason_name: z.string().trim().min(1).max(140),
  default_amount: z.coerce.number().int().positive(),
  is_active: z.boolean().default(true),
});

const updateBodySchema = z
  .object({
    reason_code: catalogCodeSchema.optional(),
    reason_name: z.string().trim().min(1).max(140).optional(),
    default_amount: z.coerce.number().int().positive().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

function centsToLegacyNumeric(cents: number) {
  return Number((cents / 100).toFixed(2));
}

function legacyNumericToCents(value: unknown) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100);
}

export async function registerInternalFineReasonsRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/safety/internal-fine-reasons", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const payload = await withCompanyScope(authUser.uuid, q.operating_company_id, async (client) => {
      const values: unknown[] = [q.operating_company_id];
      const where: string[] = ["r.operating_company_id = $1"];
      if (q.is_active === "true") where.push("r.is_active = true");
      if (q.is_active === "false") where.push("r.is_active = false");
      if (q.search) {
        values.push(`%${q.search}%`);
        where.push(`(r.reason_code ILIKE $${values.length} OR r.reason_name ILIKE $${values.length})`);
      }
      const whereClause = where.join(" AND ");

      const countRes = await client.query(`SELECT count(*)::text AS total FROM catalogs.internal_fine_reasons r WHERE ${whereClause}`, values);
      values.push(q.limit);
      values.push(q.offset);
      const rowsRes = await client.query(
        `
          SELECT
            r.id,
            r.operating_company_id,
            r.reason_code,
            r.reason_name,
            r.default_amount,
            r.is_active,
            NULL::timestamptz AS created_at,
            NULL::timestamptz AS updated_at
          FROM catalogs.internal_fine_reasons r
          WHERE ${whereClause}
          ORDER BY r.reason_code ASC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      const rows = rowsRes.rows.map((row: Record<string, unknown>) => ({
        ...row,
        default_amount: legacyNumericToCents(row.default_amount),
      }));
      return { rows, total: Number(((countRes.rows[0] as { total?: string } | undefined)?.total ?? 0)) };
    });

    return payload;
  });

  app.get("/api/v1/catalogs/safety/internal-fine-reasons/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);

    const row = await withCompanyScope(authUser.uuid, parsedQuery.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            id,
            operating_company_id,
            reason_code,
            reason_name,
            default_amount,
            is_active,
            NULL::timestamptz AS created_at,
            NULL::timestamptz AS updated_at
          FROM catalogs.internal_fine_reasons
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [parsedParams.data.id, parsedQuery.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "catalog_internal_fine_reason_not_found" });
    return { ...row, default_amount: legacyNumericToCents((row as Record<string, unknown>).default_amount) };
  });

  app.post("/api/v1/catalogs/safety/internal-fine-reasons", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedQuery = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
    const parsedBody = createBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return validationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const created = await withCompanyScope(authUser.uuid, parsedQuery.data.operating_company_id, async (client) => {
      const conflict = await client.query(
        `
          SELECT id
          FROM catalogs.internal_fine_reasons
          WHERE operating_company_id = $1
            AND reason_code = $2
          LIMIT 1
        `,
        [parsedQuery.data.operating_company_id, b.reason_code]
      );
      if (conflict.rows.length > 0) return { error: "catalog_internal_fine_reason_code_conflict" as const };

      const res = await client.query(
        `
          INSERT INTO catalogs.internal_fine_reasons (
            operating_company_id, reason_code, reason_name, default_amount, is_active
          )
          VALUES ($1,$2,$3,$4,$5)
          RETURNING
            id,
            operating_company_id,
            reason_code,
            reason_name,
            default_amount,
            is_active,
            NULL::timestamptz AS created_at,
            NULL::timestamptz AS updated_at
        `,
        [parsedQuery.data.operating_company_id, b.reason_code, b.reason_name, centsToLegacyNumeric(b.default_amount), b.is_active]
      );
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, "catalogs.internal_fine_reasons_created", {
        resource_id: row.id,
        resource_type: "catalogs.internal_fine_reasons",
        reason_code: row.reason_code,
      });
      return { row };
    });

    if ("error" in created) return reply.code(409).send({ error: created.error });
    return reply.code(201).send({ ...created.row, default_amount: legacyNumericToCents(created.row.default_amount) });
  });

  app.patch("/api/v1/catalogs/safety/internal-fine-reasons/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
    const parsedBody = updateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return validationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const updated = await withCompanyScope(authUser.uuid, parsedQuery.data.operating_company_id, async (client) => {
      if (b.reason_code) {
        const conflict = await client.query(
          `
            SELECT id
            FROM catalogs.internal_fine_reasons
            WHERE operating_company_id = $1
              AND reason_code = $2
              AND id <> $3
            LIMIT 1
          `,
          [parsedQuery.data.operating_company_id, b.reason_code, parsedParams.data.id]
        );
        if (conflict.rows.length > 0) return { error: "catalog_internal_fine_reason_code_conflict" as const };
      }

      const fields: string[] = [];
      const values: unknown[] = [];
      const add = (sql: string, value: unknown) => {
        values.push(value);
        fields.push(`${sql} = $${values.length}`);
      };
      if ("reason_code" in b) add("reason_code", b.reason_code);
      if ("reason_name" in b) add("reason_name", b.reason_name);
      if ("default_amount" in b) add("default_amount", centsToLegacyNumeric(b.default_amount as number));
      if ("is_active" in b) add("is_active", b.is_active);
      values.push(parsedParams.data.id, parsedQuery.data.operating_company_id);

      const res = await client.query(
        `
          UPDATE catalogs.internal_fine_reasons
          SET ${fields.join(", ")}
          WHERE id = $${values.length - 1}
            AND operating_company_id = $${values.length}
          RETURNING
            id,
            operating_company_id,
            reason_code,
            reason_name,
            default_amount,
            is_active,
            NULL::timestamptz AS created_at,
            NULL::timestamptz AS updated_at
        `,
        values
      );
      if (res.rows.length === 0) return { error: "catalog_internal_fine_reason_not_found" as const };
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, "catalogs.internal_fine_reasons_updated", {
        resource_id: row.id,
        resource_type: "catalogs.internal_fine_reasons",
      });
      return { row };
    });

    if ("error" in updated) {
      if (updated.error === "catalog_internal_fine_reason_not_found") return reply.code(404).send({ error: updated.error });
      return reply.code(409).send({ error: updated.error });
    }
    return { ...updated.row, default_amount: legacyNumericToCents(updated.row.default_amount) };
  });

  app.delete("/api/v1/catalogs/safety/internal-fine-reasons/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);

    const result = await withCompanyScope(authUser.uuid, parsedQuery.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE catalogs.internal_fine_reasons
          SET is_active = false
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING id, reason_code
        `,
        [parsedParams.data.id, parsedQuery.data.operating_company_id]
      );
      if (res.rows.length === 0) return null;
      await appendCrudAudit(client, authUser.uuid, "catalogs.internal_fine_reasons_deactivated", {
        resource_id: res.rows[0].id,
        resource_type: "catalogs.internal_fine_reasons",
        reason_code: res.rows[0].reason_code,
      });
      return { ok: true };
    });

    if (!result) return reply.code(404).send({ error: "catalog_internal_fine_reason_not_found" });
    return result;
  });
}
