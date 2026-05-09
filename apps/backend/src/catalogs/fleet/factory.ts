import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { isCatalogWriteRole } from "../../auth/role-helpers.js";
import { companyQuerySchema, currentAuthUser, idParamSchema, listQuerySchema, validationError } from "./shared.js";

type CatalogFactoryConfig = {
  tableName: string;
  urlSegment: string;
  routePrefix: string;
  displayName: string;
  codeRegex: RegExp;
  readOnly?: boolean;
};

const tableNameGuard = /^[a-z_]+$/;
const urlSegmentGuard = /^[a-z-]+$/;

export function createCatalogRoutes(app: FastifyInstance, config: CatalogFactoryConfig) {
  if (!tableNameGuard.test(config.tableName)) throw new Error(`invalid_table_name_for_catalog_factory: ${config.tableName}`);
  if (!urlSegmentGuard.test(config.urlSegment)) throw new Error(`invalid_url_segment_for_catalog_factory: ${config.urlSegment}`);

  const basePath = `${config.routePrefix}/${config.urlSegment}`;
  const createBodySchema = z.object({
    code: z.string().trim().regex(config.codeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
    is_active: z.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(50),
  });
  const updateBodySchema = z
    .object({
      code: z.string().trim().regex(config.codeRegex).optional(),
      display_name: z.string().trim().min(1).max(160).optional(),
      description: z.string().trim().max(500).nullable().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
      is_active: z.boolean().optional(),
      sort_order: z.coerce.number().int().min(0).max(10000).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

  app.get(basePath, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const payload = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const where: string[] = [];
      if (q.is_active === "true") where.push("t.is_active = true AND t.deactivated_at IS NULL");
      if (q.is_active === "false") where.push("(t.is_active = false OR t.deactivated_at IS NOT NULL)");
      if (q.search) {
        values.push(`%${q.search}%`);
        where.push(`(t.code ILIKE $${values.length} OR t.name ILIKE $${values.length} OR COALESCE(t.description, '') ILIKE $${values.length})`);
      }
      const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const countRes = await client.query(`SELECT count(*)::text AS total FROM catalogs.${config.tableName} t ${whereClause}`, values);
      values.push(q.limit, q.offset);
      const rowsRes = await client.query(
        `
          SELECT
            t.id,
            t.code,
            t.name AS display_name,
            t.description,
            '{}'::jsonb AS metadata,
            t.is_active,
            t.sort_order,
            t.created_at,
            t.updated_at
          FROM catalogs.${config.tableName} t
          ${whereClause}
          ORDER BY t.sort_order ASC, t.code ASC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return { rows: rowsRes.rows, total: Number((countRes.rows[0] as { total?: string } | undefined)?.total ?? 0) };
    });

    return payload;
  });

  app.get(`${basePath}/:id`, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            id,
            code,
            name AS display_name,
            description,
            '{}'::jsonb AS metadata,
            is_active,
            sort_order,
            created_at,
            updated_at
          FROM catalogs.${config.tableName}
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: `catalog_${config.tableName}_not_found` });
    return row;
  });

  app.post(basePath, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (config.readOnly) return reply.code(405).send({ error: "catalog_read_only" });
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
    const parsedBody = createBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return validationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const created = await withCurrentUser(authUser.uuid, async (client) => {
      const conflict = await client.query(`SELECT id FROM catalogs.${config.tableName} WHERE code = $1 LIMIT 1`, [b.code]);
      if (conflict.rows.length > 0) return { error: `catalog_${config.tableName}_code_conflict` as const };
      const res = await client.query(
        `
          INSERT INTO catalogs.${config.tableName} (code, name, description, is_active, sort_order, created_by_user_id, updated_by_user_id)
          VALUES ($1,$2,$3,$4,$5,$6,$6)
          RETURNING id, code, name AS display_name, description, '{}'::jsonb AS metadata, is_active, sort_order, created_at, updated_at
        `,
        [b.code, b.display_name, b.description ?? null, b.is_active, b.sort_order, authUser.uuid]
      );
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, `catalogs.${config.tableName}_created`, {
        resource_id: row.id,
        resource_type: `catalogs.${config.tableName}`,
        code: row.code,
        catalog_display_name: config.displayName,
      });
      return { row };
    });

    if ("error" in created) return reply.code(409).send({ error: created.error });
    return reply.code(201).send(created.row);
  });

  app.patch(`${basePath}/:id`, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (config.readOnly) return reply.code(405).send({ error: "catalog_read_only" });
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
    const parsedBody = updateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return validationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      if (b.code) {
        const conflict = await client.query(`SELECT id FROM catalogs.${config.tableName} WHERE code = $1 AND id <> $2 LIMIT 1`, [
          b.code,
          parsedParams.data.id,
        ]);
        if (conflict.rows.length > 0) return { error: `catalog_${config.tableName}_code_conflict` as const };
      }

      const fields: string[] = [];
      const values: unknown[] = [];
      const add = (name: string, value: unknown) => {
        values.push(value);
        fields.push(`${name} = $${values.length}`);
      };
      if ("code" in b) add("code", b.code);
      if ("display_name" in b) add("name", b.display_name);
      if ("description" in b) add("description", b.description ?? null);
      if ("is_active" in b) {
        add("is_active", b.is_active);
        if (b.is_active === false) add("deactivated_at", new Date().toISOString());
        if (b.is_active === true) add("deactivated_at", null);
      }
      if ("sort_order" in b) add("sort_order", b.sort_order);
      add("updated_at", new Date().toISOString());
      add("updated_by_user_id", authUser.uuid);
      values.push(parsedParams.data.id);

      const res = await client.query(
        `
          UPDATE catalogs.${config.tableName}
          SET ${fields.join(", ")}
          WHERE id = $${values.length}
          RETURNING id, code, name AS display_name, description, '{}'::jsonb AS metadata, is_active, sort_order, created_at, updated_at
        `,
        values
      );
      if (res.rows.length === 0) return { error: `catalog_${config.tableName}_not_found` as const };
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, `catalogs.${config.tableName}_updated`, {
        resource_id: row.id,
        resource_type: `catalogs.${config.tableName}`,
        catalog_display_name: config.displayName,
      });
      return { row };
    });

    if ("error" in updated) {
      if (updated.error === `catalog_${config.tableName}_not_found`) return reply.code(404).send({ error: updated.error });
      return reply.code(409).send({ error: updated.error });
    }
    return updated.row;
  });

  app.delete(`${basePath}/:id`, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (config.readOnly) return reply.code(405).send({ error: "catalog_read_only" });
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE catalogs.${config.tableName}
          SET is_active = false,
              deactivated_at = now(),
              updated_at = now(),
              updated_by_user_id = $2
          WHERE id = $1
          RETURNING id, code
        `,
        [parsedParams.data.id, authUser.uuid]
      );
      if (res.rows.length === 0) return null;
      await appendCrudAudit(client, authUser.uuid, `catalogs.${config.tableName}_deactivated`, {
        resource_id: res.rows[0].id,
        resource_type: `catalogs.${config.tableName}`,
        code: res.rows[0].code,
        catalog_display_name: config.displayName,
      });
      return { ok: true };
    });

    if (!result) return reply.code(404).send({ error: `catalog_${config.tableName}_not_found` });
    return result;
  });
}
