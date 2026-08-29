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
  /**
   * Extra boolean columns (e.g. may_draw_escrow on driver_deduction_types). Declared here; presence
   * is resolved against the live database per request, so declaring one before its held migration is
   * applied degrades the field away instead of 500-ing the catalog.
   */
  optionalBooleans?: string[];
  /**
   * Extra constrained-choice text columns (e.g. default_recovery_rail). `values` MUST come from the
   * single place that already owns the vocabulary — never re-declared here — or the catalog and the
   * database CHECK can drift into two dialects. Same presence resolution as optionalBooleans.
   */
  optionalEnums?: Array<{ column: string; values: readonly string[] }>;
  deprecation?: {
    navSegment: string;
    successorListsSegment: string;
    writesBlocked?: boolean;
  };
};

function maybeMarkDeprecated(reply: FastifyReply, config: CatalogFactoryConfig) {
  if (!config.deprecation) return;
  applyDriverCatalogDeprecation(reply, config.deprecation.navSegment, config.deprecation.successorListsSegment);
}

function sendSplitBrainWritesBlocked(reply: FastifyReply, config: CatalogFactoryConfig) {
  const successor = config.deprecation?.successorListsSegment ?? config.urlSegment;
  return reply.code(410).send({
    error: `catalog_${config.tableName}_write_disabled_split_brain`,
    message:
      `Writes to catalogs.${config.tableName} are permanently disabled (SWEEP-C11 split-brain fix, ` +
      `2026-07-25). This table is a confirmed split-brain LOSER — a row created here was invisible ` +
      `on the canonical store. Use /api/v1/lists/drivers/${successor} instead.`,
  });
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
  const declaredBooleans = (config.optionalBooleans ?? []).filter((c) => /^[a-z_]+$/.test(c));

  // An optional boolean is DECLARED in code but only exists in the database once the owner applies
  // the held migration that adds it. Selecting it unconditionally means the catalog endpoint throws
  // 42703 — and therefore 500s the whole Lists page — for the entire window between merge and apply.
  // CI never sees it, because CI builds a fresh database where every migration has run; only prod,
  // where held migrations wait on the owner, has the pre-apply shape. That is the documented
  // CI-schema-vs-prod-schema trap, so the column set is resolved from the live database instead of
  // assumed from the config.
  //
  // Only POSITIVE results are cached: a column appears when a migration is applied, but never
  // disappears (void-not-delete), so a cached "exists" stays true forever, while caching "absent"
  // would pin the surface to its pre-apply shape until the process restarts.
  const declaredEnums = (config.optionalEnums ?? []).filter((e) => /^[a-z_]+$/.test(e.column));
  const declaredOptional = [...declaredBooleans, ...declaredEnums.map((e) => e.column)];

  const provenBooleans = new Set<string>();
  async function resolveOptional(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> }) {
    if (declaredOptional.length === 0) return [];
    const unproven = declaredOptional.filter((c) => !provenBooleans.has(c));
    if (unproven.length > 0) {
      const res = await client.query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'catalogs'
            AND table_name = $1
            AND column_name = ANY($2::text[])`,
        [config.tableName, unproven]
      );
      for (const r of res.rows) provenBooleans.add(String((r as { column_name: string }).column_name));
    }
    return declaredOptional.filter((c) => provenBooleans.has(c));
  }
  const resolveBooleans = resolveOptional;

  const returningColsFor = (cols: string[]) => `
            id,
            operating_company_id,
            code,
            display_name,
            description,
            metadata,
            is_active,
            sort_order,
            ${cols.length ? `${cols.join(",\n            ")},` : ""}
            created_at,
            updated_at`;

  const createBodySchema = z.object({
    code: z.string().trim().regex(config.codeRegex),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
    is_active: z.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(50),
    ...Object.fromEntries(declaredBooleans.map((c) => [c, z.boolean().default(false)])),
    ...Object.fromEntries(
      declaredEnums.map((e) => [e.column, z.enum(e.values as [string, ...string[]]).optional()])
    ),
  });

  const updateBodySchema = z
    .object({
      code: z.string().trim().regex(config.codeRegex).optional(),
      display_name: z.string().trim().min(1).max(160).optional(),
      description: z.string().trim().max(500).nullable().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
      is_active: z.boolean().optional(),
      sort_order: z.coerce.number().int().min(0).max(10000).optional(),
      ...Object.fromEntries(declaredBooleans.map((c) => [c, z.boolean().optional()])),
      ...Object.fromEntries(
        declaredEnums.map((e) => [e.column, z.enum(e.values as [string, ...string[]]).optional()])
      ),
    })
    .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

  app.get(basePath, async (req, reply) => {
    maybeMarkDeprecated(reply, config);
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const payload = await withCompanyScope(authUser.uuid, q.operating_company_id, async (client) => {
      const values: unknown[] = [q.operating_company_id];
      const where: string[] = ["t.operating_company_id = $1::uuid"];
      if (q.is_active === "true") where.push("t.is_active = true");
      if (q.is_active === "false") where.push("t.is_active = false");
      if (q.search) {
        values.push(`%${q.search}%`);
        where.push(
          `(t.code ILIKE $${values.length} OR t.display_name ILIKE $${values.length} OR COALESCE(t.description, '') ILIKE $${values.length})`
        );
      }
      const whereClause = where.join(" AND ");
      const availableBooleans = await resolveBooleans(client);
      const boolSelect = availableBooleans.map((c) => `t.${c}`).join(",\n            ");

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
            ${boolSelect ? `${boolSelect},` : ""}
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
    if (!authUser) return reply;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);

    const row = await withCompanyScope(authUser.uuid, parsedQuery.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            ${returningColsFor(await resolveBooleans(client))}
          FROM catalogs.${config.tableName}
          WHERE id = $1
            AND operating_company_id = $2::uuid
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
    if (!authUser) return reply;
    if (config.deprecation?.writesBlocked) return sendSplitBrainWritesBlocked(reply, config);
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
          WHERE operating_company_id = $1::uuid
            AND code = $2
          LIMIT 1
        `,
        [parsedQuery.data.operating_company_id, b.code]
      );
      if (conflict.rows.length > 0) return { error: `catalog_${config.tableName}_code_conflict` as const };

      const availableBooleans = await resolveBooleans(client);
      // CC3-DEDUCTRAIL-01: declaredBooleans are zod `.default(false)` so they are ALWAYS present in
      // `b`; declaredEnums (e.g. default_recovery_rail) are zod `.optional()` with NO default, so an
      // unset one is genuinely `undefined` in `b`. The old code inserted every available column
      // unconditionally, falling back to `?? null` for an unset enum -- an EXPLICIT NULL in a
      // positional INSERT overrides the column's own SQL DEFAULT (catalogs.driver_deduction_types.
      // default_recovery_rail DEFAULT 'ask', migration 202609310000), so every create hit a real
      // NOT NULL violation (23502) instead of falling through to the owner-authored 'ask' default.
      // Insertable columns must mirror the PATCH handler's own `if (!(col in b)) continue` presence
      // check a few lines below: always insert declared booleans (never undefined), only insert a
      // declared enum when the operator actually chose a value, and omit it entirely otherwise so
      // Postgres applies its own DEFAULT.
      const insertableOptional = availableBooleans.filter(
        (c) => declaredBooleans.includes(c) || c in b
      );
      const boolInsertCols = insertableOptional.length ? `, ${insertableOptional.join(", ")}` : "";
      const boolInsertPlaceholders = insertableOptional.map((_, i) => `$${8 + i}`).join(", ");
      const boolInsertValues = insertableOptional.map((c) =>
        declaredBooleans.includes(c) ? Boolean((b as Record<string, unknown>)[c]) : (b as Record<string, unknown>)[c]
      );
      const res = await client.query(
        `
          INSERT INTO catalogs.${config.tableName} (
            operating_company_id, code, display_name, description, metadata, is_active, sort_order${boolInsertCols}
          )
          VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7${boolInsertPlaceholders ? `, ${boolInsertPlaceholders}` : ""})
          RETURNING
            ${returningColsFor(availableBooleans)}
        `,
        [
          parsedQuery.data.operating_company_id,
          b.code,
          b.display_name,
          b.description ?? null,
          JSON.stringify(b.metadata ?? {}),
          b.is_active,
          b.sort_order,
          ...boolInsertValues,
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
    if (!authUser) return reply;
    if (config.deprecation?.writesBlocked) return sendSplitBrainWritesBlocked(reply, config);
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
            WHERE operating_company_id = $1::uuid
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
      const availableBooleans = await resolveBooleans(client);
      for (const col of availableBooleans) {
        if (!(col in b)) continue;
        add(col, declaredBooleans.includes(col) ? Boolean((b as Record<string, unknown>)[col]) : (b as Record<string, unknown>)[col]);
      }
      fields.push("updated_at = now()");
      values.push(parsedParams.data.id, parsedQuery.data.operating_company_id);

      const res = await client.query(
        `
          UPDATE catalogs.${config.tableName}
          SET ${fields.join(", ")}
          WHERE id = $${values.length - 1}
            AND operating_company_id = $${values.length}::uuid
          RETURNING
            ${returningColsFor(availableBooleans)}
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
    if (!authUser) return reply;
    if (config.deprecation?.writesBlocked) return sendSplitBrainWritesBlocked(reply, config);
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
            AND operating_company_id = $2::uuid
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
