import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { isCatalogWriteRole } from "../../auth/role-helpers.js";
import {
  companyQuerySchema,
  companyScopedCompanyQuerySchema,
  companyScopedListQuerySchema,
  currentAuthUser,
  idParamSchema,
  listQuerySchema,
  validationError,
  withCompanyScope,
} from "./shared.js";

type CatalogFactoryConfig = {
  tableName: string;
  urlSegment: string;
  routePrefix: string;
  displayName: string;
  codeRegex: RegExp;
  readOnly?: boolean;
  /** A small number of operational pickers legitimately request more than the default 200 rows. */
  listLimitMax?: number;
  // PER-ENTITY (owner ruling 2026-07-24): when true, the catalog carries operating_company_id and
  // every read/write is membership-checked + RLS-scoped to that entity via withCompanyScope, and the
  // uniqueness of `code` is per-entity. REQUIRED explicitly (LST-F02b) — omitting used to default to
  // GLOBAL and silently re-introduce the entity-blind factory. tire_positions is GLOBAL-BY-DESIGN and
  // lives in tire-positions.routes.ts (not this factory). Migration 202607860000 + equipment_types
  // conversion cover the companyScoped:true fleet catalogs registered in index.ts.
  companyScoped: boolean;
};

// Minimal structural client — matches both withCurrentUser's client and withCompanyScope's DbClient.
type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

const tableNameGuard = /^[a-z_]+$/;
const urlSegmentGuard = /^[a-z-]+$/;

export function createCatalogRoutes(app: FastifyInstance, config: CatalogFactoryConfig) {
  if (!tableNameGuard.test(config.tableName)) throw new Error(`invalid_table_name_for_catalog_factory: ${config.tableName}`);
  if (!urlSegmentGuard.test(config.urlSegment)) throw new Error(`invalid_url_segment_for_catalog_factory: ${config.urlSegment}`);

  const scoped = config.companyScoped === true;
  const catalogListQuerySchema = config.listLimitMax
    ? listQuerySchema.extend({ limit: z.coerce.number().int().min(1).max(config.listLimitMax).default(50) })
    : listQuerySchema;
  const basePath = `${config.routePrefix}/${config.urlSegment}`;
  // operating_company_id column is projected only for scoped catalogs (the global ones don't have it).
  const opcoSelect = scoped ? "t.operating_company_id," : "";
  const opcoSelectBare = scoped ? "operating_company_id," : "";

  // Run `fn` under the right scope: per-entity catalogs go through withCompanyScope (membership +
  // GUC + RLS); global catalogs keep the plain withCurrentUser path. Both hand `fn` a DbClient.
  const run = <T,>(userId: string, operatingCompanyId: string | null, fn: (client: DbClient) => Promise<T>) =>
    scoped && operatingCompanyId
      ? withCompanyScope(userId, operatingCompanyId, fn)
      : withCurrentUser(userId, (client) => fn(client as unknown as DbClient));

  const createBodySchema = z.object({
    code: z.string().trim().regex(config.codeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    // SAF/LST — verified on prod 2026-07-24: NO fleet catalog table has a `metadata` column. This
    // schema previously ACCEPTED metadata and the INSERT then discarded it (the "accepted by the API
    // is not done" anti-pattern). Removed so the contract matches the schema — zod strips the modal's
    // vestigial metadata:{} payload silently, no error.
    is_active: z.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(50),
  });
  const updateBodySchema = z
    .object({
      code: z.string().trim().regex(config.codeRegex).optional(),
      display_name: z.string().trim().min(1).max(160).optional(),
      description: z.string().trim().max(500).nullable().optional(),
      is_active: z.boolean().optional(),
      sort_order: z.coerce.number().int().min(0).max(10000).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

  app.get(basePath, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    const parsed = (scoped ? companyScopedListQuerySchema : catalogListQuerySchema).safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;
    const opco = scoped ? (q as { operating_company_id: string }).operating_company_id : null;

    const payload = await run(authUser.uuid, opco, async (client) => {
      const values: unknown[] = [];
      const where: string[] = [];
      if (scoped && opco) {
        values.push(opco);
        where.push(`t.operating_company_id = $${values.length}::uuid`);
      }
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
            ${opcoSelect}
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
    if (!authUser) return reply;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = (scoped ? companyScopedCompanyQuerySchema : companyQuerySchema).safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
    const opco = scoped ? (parsedQuery.data as { operating_company_id: string }).operating_company_id : null;

    const row = await run(authUser.uuid, opco, async (client) => {
      const values: unknown[] = [parsedParams.data.id];
      let where = "WHERE id = $1";
      if (scoped && opco) {
        values.push(opco);
        where += ` AND operating_company_id = $${values.length}::uuid`;
      }
      const res = await client.query(
        `
          SELECT
            id,
            ${opcoSelectBare}
            code,
            name AS display_name,
            description,
            '{}'::jsonb AS metadata,
            is_active,
            sort_order,
            created_at,
            updated_at
          FROM catalogs.${config.tableName}
          ${where}
          LIMIT 1
        `,
        values
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: `catalog_${config.tableName}_not_found` });
    return row;
  });

  app.post(basePath, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (config.readOnly) return reply.code(405).send({ error: "catalog_read_only" });
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedQuery = (scoped ? companyScopedCompanyQuerySchema : companyQuerySchema).safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
    const parsedBody = createBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return validationError(reply, parsedBody.error);
    const b = parsedBody.data;
    const opco = scoped ? (parsedQuery.data as { operating_company_id: string }).operating_company_id : null;

    const created = await run(authUser.uuid, opco, async (client) => {
      // Code uniqueness is per-entity when scoped, global otherwise.
      const conflict =
        scoped && opco
          ? await client.query(`SELECT id FROM catalogs.${config.tableName} WHERE operating_company_id = $1::uuid AND code = $2 LIMIT 1`, [opco, b.code])
          : await client.query(`SELECT id FROM catalogs.${config.tableName} WHERE code = $1 LIMIT 1`, [b.code]);
      if (conflict.rows.length > 0) return { error: `catalog_${config.tableName}_code_conflict` as const };

      const res =
        scoped && opco
          ? await client.query(
              `
                INSERT INTO catalogs.${config.tableName} (operating_company_id, code, name, description, is_active, sort_order, created_by_user_id, updated_by_user_id)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
                RETURNING id, operating_company_id, code, name AS display_name, description, '{}'::jsonb AS metadata, is_active, sort_order, created_at, updated_at
              `,
              [opco, b.code, b.display_name, b.description ?? null, b.is_active, b.sort_order, authUser.uuid]
            )
          : await client.query(
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
        operating_company_id: opco ?? undefined,
        catalog_display_name: config.displayName,
      });
      return { row };
    });

    if ("error" in created) return reply.code(409).send({ error: created.error });
    return reply.code(201).send(created.row);
  });

  app.patch(`${basePath}/:id`, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (config.readOnly) return reply.code(405).send({ error: "catalog_read_only" });
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = (scoped ? companyScopedCompanyQuerySchema : companyQuerySchema).safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
    const parsedBody = updateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return validationError(reply, parsedBody.error);
    const b = parsedBody.data;
    const opco = scoped ? (parsedQuery.data as { operating_company_id: string }).operating_company_id : null;

    const updated = await run(authUser.uuid, opco, async (client) => {
      if (b.code) {
        const conflict =
          scoped && opco
            ? await client.query(`SELECT id FROM catalogs.${config.tableName} WHERE operating_company_id = $1::uuid AND code = $2 AND id <> $3 LIMIT 1`, [
                opco,
                b.code,
                parsedParams.data.id,
              ])
            : await client.query(`SELECT id FROM catalogs.${config.tableName} WHERE code = $1 AND id <> $2 LIMIT 1`, [b.code, parsedParams.data.id]);
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
      const idIdx = values.length;
      let where = `WHERE id = $${idIdx}`;
      if (scoped && opco) {
        values.push(opco);
        where += ` AND operating_company_id = $${values.length}::uuid`;
      }

      const res = await client.query(
        `
          UPDATE catalogs.${config.tableName}
          SET ${fields.join(", ")}
          ${where}
          RETURNING id, code, name AS display_name, description, '{}'::jsonb AS metadata, is_active, sort_order, created_at, updated_at
        `,
        values
      );
      if (res.rows.length === 0) return { error: `catalog_${config.tableName}_not_found` as const };
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, `catalogs.${config.tableName}_updated`, {
        resource_id: row.id,
        resource_type: `catalogs.${config.tableName}`,
        operating_company_id: opco ?? undefined,
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
    if (!authUser) return reply;
    if (config.readOnly) return reply.code(405).send({ error: "catalog_read_only" });
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = (scoped ? companyScopedCompanyQuerySchema : companyQuerySchema).safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
    const opco = scoped ? (parsedQuery.data as { operating_company_id: string }).operating_company_id : null;

    const result = await run(authUser.uuid, opco, async (client) => {
      const values: unknown[] = [parsedParams.data.id, authUser.uuid];
      let where = "WHERE id = $1";
      if (scoped && opco) {
        values.push(opco);
        where += ` AND operating_company_id = $${values.length}::uuid`;
      }
      const res = await client.query(
        `
          UPDATE catalogs.${config.tableName}
          SET is_active = false,
              deactivated_at = now(),
              updated_at = now(),
              updated_by_user_id = $2
          ${where}
          RETURNING id, code
        `,
        values
      );
      if (res.rows.length === 0) return null;
      await appendCrudAudit(client, authUser.uuid, `catalogs.${config.tableName}_deactivated`, {
        resource_id: res.rows[0].id,
        resource_type: `catalogs.${config.tableName}`,
        code: res.rows[0].code,
        operating_company_id: opco ?? undefined,
        catalog_display_name: config.displayName,
      });
      return { ok: true };
    });

    if (!result) return reply.code(404).send({ error: `catalog_${config.tableName}_not_found` });
    return result;
  });
}
