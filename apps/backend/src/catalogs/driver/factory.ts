import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { isCatalogWriteRole } from "../../auth/role-helpers.js";
import { applyDriverCatalogDeprecation } from "./deprecation.js";
import { companyQuerySchema, currentAuthUser, idParamSchema, listQuerySchema, validationError, withCompanyScope } from "./shared.js";

type CatalogFactoryConfig = {
  tableName: string;
  urlSegment: string;
  routePrefix: string;
  displayName: string;
  codeRegex: RegExp;
  deprecation?: {
    navSegment: string;
    successorListsSegment: string;
  };
};

function maybeMarkDeprecated(reply: FastifyReply, config: CatalogFactoryConfig) {
  if (!config.deprecation) return;
  applyDriverCatalogDeprecation(reply, config.deprecation.navSegment, config.deprecation.successorListsSegment);
}

const tableNameGuard = /^[a-z_]+$/;
const urlSegmentGuard = /^[a-z-]+$/;

export function createCatalogRoutes(app: FastifyInstance, config: CatalogFactoryConfig) {
  if (!tableNameGuard.test(config.tableName)) {
    throw new Error(`invalid_table_name_for_catalog_factory: ${config.tableName}`);
  }
  if (!urlSegmentGuard.test(config.urlSegment)) {
    throw new Error(`invalid_url_segment_for_catalog_factory: ${config.urlSegment}`);
  }

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
    maybeMarkDeprecated(reply, config);
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const payload = await withCompanyScope(authUser.uuid, q.operating_company_id, async (client) => {
      const values: unknown[] = [q.operating_company_id];
      const where: string[] = ["t.operating_company_id = $1"];
      if (q.is_active === "true") where.push("t.is_active = true");
      if (q.is_active === "false") where.push("t.is_active = false");
      if (q.search) {
        values.push(`%${q.search}%`);
        where.push(
          `(t.code ILIKE $${values.length} OR t.display_name ILIKE $${values.length} OR COALESCE(t.description, '') ILIKE $${values.length})`
        );
      }
      const whereClause = where.join(" AND ");

      const countRes = await client.query(`SELECT count(*)::text AS total FROM catalogs.${config.tableName} t WHERE ${whereClause}`, values);
      values.push(q.limit);
      values.push(q.offset);
      const rowsRes = await client.query(
        `
          SELECT
            t.id,
            t.operating_company_id,
            t.code,
            t.display_name,
            t.description,
            t.metadata,
            t.is_active,
            t.sort_order,
            t.created_at,
            t.updated_at
          FROM catalogs.${config.tableName} t
          WHERE ${whereClause}
          ORDER BY t.sort_order ASC, t.code ASC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );

      return { rows: rowsRes.rows, total: Number(((countRes.rows[0] as { total?: string } | undefined)?.total ?? 0)) };
    });

    return payload;
  });

  app.get(`${basePath}/:id`, async (req, reply) => {
    maybeMarkDeprecated(reply, config);
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);

    const row = await withCompanyScope(authUser.uuid, parsedQuery.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            id,
            operating_company_id,
            code,
            display_name,
            description,
            metadata,
            is_active,
            sort_order,
            created_at,
            updated_at
          FROM catalogs.${config.tableName}
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [parsedParams.data.id, parsedQuery.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: `catalog_${config.tableName}_not_found` });
    return row;
  });

  app.post(basePath, async (req, reply) => {
    maybeMarkDeprecated(reply, config);
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
    const parsedBody = createBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return validationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const created = await withCompanyScope(authUser.uuid, parsedQuery.data.operating_company_id, async (client) => {
      const conflict = await client.query(
        `
          SELECT id
          FROM catalogs.${config.tableName}
          WHERE operating_company_id = $1
            AND code = $2
          LIMIT 1
        `,
        [parsedQuery.data.operating_company_id, b.code]
      );
      if (conflict.rows.length > 0) return { error: `catalog_${config.tableName}_code_conflict` as const };

      const res = await client.query(
        `
          INSERT INTO catalogs.${config.tableName} (
            operating_company_id, code, display_name, description, metadata, is_active, sort_order
          )
          VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
          RETURNING
            id,
            operating_company_id,
            code,
            display_name,
            description,
            metadata,
            is_active,
            sort_order,
            created_at,
            updated_at
        `,
        [
          parsedQuery.data.operating_company_id,
          b.code,
          b.display_name,
          b.description ?? null,
          JSON.stringify(b.metadata ?? {}),
          b.is_active,
          b.sort_order,
        ]
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
    maybeMarkDeprecated(reply, config);
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
    const parsedBody = updateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return validationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const updated = await withCompanyScope(authUser.uuid, parsedQuery.data.operating_company_id, async (client) => {
      if (b.code) {
        const conflict = await client.query(
          `
            SELECT id
            FROM catalogs.${config.tableName}
            WHERE operating_company_id = $1
              AND code = $2
              AND id <> $3
            LIMIT 1
          `,
          [parsedQuery.data.operating_company_id, b.code, parsedParams.data.id]
        );
        if (conflict.rows.length > 0) return { error: `catalog_${config.tableName}_code_conflict` as const };
      }

      const fields: string[] = [];
      const values: unknown[] = [];
      const add = (name: string, value: unknown) => {
        values.push(value);
        fields.push(`${name} = $${values.length}`);
      };
      if ("code" in b) add("code", b.code);
      if ("display_name" in b) add("display_name", b.display_name);
      if ("description" in b) add("description", b.description ?? null);
      if ("metadata" in b) add("metadata", JSON.stringify(b.metadata ?? {}));
      if ("is_active" in b) add("is_active", b.is_active);
      if ("sort_order" in b) add("sort_order", b.sort_order);
      fields.push("updated_at = now()");
      values.push(parsedParams.data.id, parsedQuery.data.operating_company_id);

      const res = await client.query(
        `
          UPDATE catalogs.${config.tableName}
          SET ${fields.join(", ")}
          WHERE id = $${values.length - 1}
            AND operating_company_id = $${values.length}
          RETURNING
            id,
            operating_company_id,
            code,
            display_name,
            description,
            metadata,
            is_active,
            sort_order,
            created_at,
            updated_at
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
    maybeMarkDeprecated(reply, config);
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);

    const result = await withCompanyScope(authUser.uuid, parsedQuery.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE catalogs.${config.tableName}
          SET is_active = false,
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING id, code
        `,
        [parsedParams.data.id, parsedQuery.data.operating_company_id]
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
