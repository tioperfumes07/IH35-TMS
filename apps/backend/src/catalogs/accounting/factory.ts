import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { isCatalogWriteRole } from "../../auth/role-helpers.js";
import { companyQuerySchema, currentAuthUser, idParamSchema, listQuerySchema, validationError } from "./shared.js";

type ActiveMode = "deactivated_at" | "is_active";

type CatalogClient = { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

type LegacyCatalogConfig = {
  tableName: string;
  urlSegment: string;
  codeColumn: string;
  nameColumn: string;
  descriptionColumn: string;
  activeMode: ActiveMode;
  readOnly?: boolean;
  requiredMetadata?: string[];
  selectMetadataSql?: string[];
  createMapper?: (metadata: Record<string, unknown>) => Record<string, unknown>;
  updateMapper?: (metadata: Record<string, unknown>) => Record<string, unknown>;
  // AF-2c: when true, the table carries operating_company_id under FORCE-RLS (e.g. catalogs.items
  // after AF-2). Every route then REQUIRES operating_company_id, sets the app.operating_company_id
  // GUC so RLS + WITH CHECK pass, scopes reads/writes to that entity, and writes the column on insert.
  // Non-entity kinds (accounts view/classes/terms/templates) leave this unset and are unchanged.
  entityScoped?: boolean;
  // AF-2c: optional server-side validation of the mapped column values (e.g. account-type checks,
  // NetSuite-style). Runs inside the scoped tx on create/update. Returns an error code or null.
  validate?: (client: CatalogClient, mapped: Record<string, unknown>, operatingCompanyId: string) => Promise<string | null>;
};

const sqlIdentGuard = /^[a-z_]+$/;
const routeSegmentGuard = /^[a-z-]+$/;

const baseBodySchema = z.object({
  code: z.string().trim().min(1).max(120),
  display_name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  is_active: z.boolean().optional(),
});

function ensureSafeIdentifier(value: string, label: string) {
  if (!sqlIdentGuard.test(value)) throw new Error(`invalid_${label}: ${value}`);
}

function coerceRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function registerLegacyAccountingCatalogRoutes(app: FastifyInstance, config: LegacyCatalogConfig) {
  ensureSafeIdentifier(config.tableName, "table_name");
  ensureSafeIdentifier(config.codeColumn, "code_column");
  ensureSafeIdentifier(config.nameColumn, "name_column");
  ensureSafeIdentifier(config.descriptionColumn, "description_column");
  if (!routeSegmentGuard.test(config.urlSegment)) throw new Error(`invalid_url_segment: ${config.urlSegment}`);

  const basePath = `/api/v1/catalogs/accounting/${config.urlSegment}`;
  const selectMetadata = config.selectMetadataSql?.length
    ? `jsonb_build_object(${config.selectMetadataSql.join(", ")}) AS metadata`
    : "'{}'::jsonb AS metadata";
  const activeSelect =
    config.activeMode === "deactivated_at" ? "(t.deactivated_at IS NULL) AS is_active" : "t.is_active AS is_active";
  const activePredicate =
    config.activeMode === "deactivated_at"
      ? "(($1 = 'all') OR ($1 = 'true' AND t.deactivated_at IS NULL) OR ($1 = 'false' AND t.deactivated_at IS NOT NULL))"
      : "(($1 = 'all') OR ($1 = 'true' AND t.is_active = true) OR ($1 = 'false' AND t.is_active = false))";

  app.get(basePath, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;
    if (config.entityScoped && !q.operating_company_id) {
      return reply.code(400).send({ error: "operating_company_id_required" });
    }

    const payload = await withCurrentUser(authUser.uuid, async (client) => {
      if (config.entityScoped && q.operating_company_id) {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [q.operating_company_id]);
      }
      const values: unknown[] = [q.is_active];
      let entityClause = "";
      if (config.entityScoped && q.operating_company_id) {
        values.push(q.operating_company_id);
        entityClause = `AND t.operating_company_id = $${values.length}`;
      }
      let searchClause = "";
      if (q.search) {
        values.push(`%${q.search}%`);
        searchClause = `AND (COALESCE(t.${config.codeColumn}::text, '') ILIKE $${values.length} OR t.${config.nameColumn} ILIKE $${values.length} OR COALESCE(t.${config.descriptionColumn}, '') ILIKE $${values.length})`;
      }
      values.push(q.limit, q.offset);
      const rowsRes = await client.query(
        `
          SELECT
            t.id,
            COALESCE(t.${config.codeColumn}::text, '') AS code,
            t.${config.nameColumn} AS display_name,
            t.${config.descriptionColumn} AS description,
            ${selectMetadata},
            ${activeSelect},
            50::int AS sort_order,
            t.created_at,
            t.updated_at
          FROM catalogs.${config.tableName} t
          WHERE ${activePredicate}
          ${entityClause}
          ${searchClause}
          ORDER BY t.${config.nameColumn} ASC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      const countRes = await client.query(
        `
          SELECT count(*)::text AS total
          FROM catalogs.${config.tableName} t
          WHERE ${activePredicate}
          ${entityClause}
          ${searchClause}
        `,
        values.slice(0, values.length - 2)
      );
      return { rows: rowsRes.rows, total: Number(countRes.rows[0]?.total ?? 0) };
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
    const oc = parsedQuery.data.operating_company_id;
    if (config.entityScoped && !oc) return reply.code(400).send({ error: "operating_company_id_required" });

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      if (config.entityScoped && oc) {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oc]);
      }
      const values: unknown[] = [parsedParams.data.id];
      let entityClause = "";
      if (config.entityScoped && oc) {
        values.push(oc);
        entityClause = `AND t.operating_company_id = $${values.length}`;
      }
      const res = await client.query(
        `
          SELECT
            t.id,
            COALESCE(t.${config.codeColumn}::text, '') AS code,
            t.${config.nameColumn} AS display_name,
            t.${config.descriptionColumn} AS description,
            ${selectMetadata},
            ${activeSelect},
            50::int AS sort_order,
            t.created_at,
            t.updated_at
          FROM catalogs.${config.tableName} t
          WHERE t.id = $1
          ${entityClause}
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
    if (!authUser) return;
    if (config.readOnly) return reply.code(405).send({ error: "catalog_read_only" });
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
    const oc = parsedQuery.data.operating_company_id;
    if (config.entityScoped && !oc) return reply.code(400).send({ error: "operating_company_id_required" });
    const parsedBody = baseBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return validationError(reply, parsedBody.error);
    const body = parsedBody.data;
    const metadata = coerceRecord(body.metadata);
    for (const requiredKey of config.requiredMetadata ?? []) {
      if (metadata[requiredKey] === undefined || metadata[requiredKey] === null || metadata[requiredKey] === "") {
        return reply.code(400).send({ error: `missing_metadata_${requiredKey}` });
      }
    }
    const extra = config.createMapper ? config.createMapper(metadata) : {};
    const columns = [config.codeColumn, config.nameColumn, config.descriptionColumn, ...Object.keys(extra)];
    const values = [body.code, body.display_name, body.description ?? null, ...Object.values(extra)];
    if (config.activeMode === "is_active") {
      columns.push("is_active");
      values.push(body.is_active ?? true);
    }
    // AF-2c: under FORCE-RLS the row must carry operating_company_id or the WITH CHECK policy + NOT NULL reject it.
    if (config.entityScoped && oc) {
      columns.push("operating_company_id");
      values.push(oc);
    }

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      if (config.entityScoped && oc) {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oc]);
      }
      if (config.validate && oc) {
        const err = await config.validate(client, extra, oc);
        if (err) return { error: err } as const;
      }
      const placeholders = values.map((_, index) => `$${index + 1}`).join(",");
      const res = await client.query(
        `
          INSERT INTO catalogs.${config.tableName} (${columns.join(",")})
          VALUES (${placeholders})
          RETURNING id
        `,
        values
      );
      return { id: res.rows[0]?.id as string } as const;
    });
    if ("error" in result) return reply.code(400).send({ error: result.error });
    return reply.code(201).send({ id: result.id });
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
    const oc = parsedQuery.data.operating_company_id;
    if (config.entityScoped && !oc) return reply.code(400).send({ error: "operating_company_id_required" });
    const parsedBody = baseBodySchema.partial().safeParse(req.body ?? {});
    if (!parsedBody.success) return validationError(reply, parsedBody.error);
    const body = parsedBody.data;
    if (Object.keys(body).length === 0) return reply.code(400).send({ error: "no_fields_to_update" });

    const setParts: string[] = [];
    const values: unknown[] = [];
    const mappedExtra: Record<string, unknown> = {};
    const add = (name: string, value: unknown) => {
      values.push(value);
      setParts.push(`${name} = $${values.length}`);
    };
    if (body.code !== undefined) add(config.codeColumn, body.code);
    if (body.display_name !== undefined) add(config.nameColumn, body.display_name);
    if (body.description !== undefined) add(config.descriptionColumn, body.description ?? null);
    if (body.metadata !== undefined && config.updateMapper) {
      const mapped = config.updateMapper(coerceRecord(body.metadata));
      for (const [key, value] of Object.entries(mapped)) {
        add(key, value);
        mappedExtra[key] = value;
      }
    }
    if (config.activeMode === "is_active" && body.is_active !== undefined) add("is_active", body.is_active);
    if (config.activeMode === "deactivated_at" && body.is_active !== undefined) {
      add("deactivated_at", body.is_active ? null : new Date().toISOString());
    }
    add("updated_at", new Date().toISOString());
    values.push(parsedParams.data.id);
    const idPlaceholder = values.length;
    let entityClause = "";
    if (config.entityScoped && oc) {
      values.push(oc);
      entityClause = `AND operating_company_id = $${values.length}`;
    }

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      if (config.entityScoped && oc) {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oc]);
      }
      if (config.validate && oc && Object.keys(mappedExtra).length > 0) {
        const err = await config.validate(client, mappedExtra, oc);
        if (err) return { error: err } as const;
      }
      const res = await client.query(
        `
          UPDATE catalogs.${config.tableName}
          SET ${setParts.join(", ")}
          WHERE id = $${idPlaceholder}
          ${entityClause}
          RETURNING id
        `,
        values
      );
      return { id: (res.rows[0]?.id as string | undefined) ?? null } as const;
    });
    if ("error" in result) return reply.code(400).send({ error: result.error });
    if (!result.id) return reply.code(404).send({ error: `catalog_${config.tableName}_not_found` });
    return { id: result.id };
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
    const oc = parsedQuery.data.operating_company_id;
    if (config.entityScoped && !oc) return reply.code(400).send({ error: "operating_company_id_required" });

    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      if (config.entityScoped && oc) {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oc]);
      }
      const values: unknown[] = [parsedParams.data.id];
      let entityClause = "";
      if (config.entityScoped && oc) {
        values.push(oc);
        entityClause = `AND operating_company_id = $${values.length}`;
      }
      const res = await client.query(
        config.activeMode === "deactivated_at"
          ? `UPDATE catalogs.${config.tableName} SET deactivated_at = now(), updated_at = now() WHERE id = $1 ${entityClause} RETURNING id`
          : `UPDATE catalogs.${config.tableName} SET is_active = false, updated_at = now() WHERE id = $1 ${entityClause} RETURNING id`,
        values
      );
      return res.rows[0]?.id ?? null;
    });
    if (!updated) return reply.code(404).send({ error: `catalog_${config.tableName}_not_found` });
    return { ok: true };
  });
}

export function registerQboCategoriesCatalogRoutes(app: FastifyInstance) {
  const basePath = "/api/v1/catalogs/accounting/qbo-categories";
  const createBody = z.object({
    code: z.string().trim().min(1).max(120),
    display_name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(500).optional(),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
    is_active: z.boolean().default(true),
    sort_order: z.coerce.number().int().min(0).max(10000).default(50),
  });
  const updateBody = createBody.partial().refine((value) => Object.keys(value).length > 0, {
    message: "at least one field is required",
  });

  app.get(basePath, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;
    if (!q.operating_company_id) return reply.code(400).send({ error: "operating_company_id_required" });

    const payload = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [q.operating_company_id];
      const where: string[] = ["operating_company_id = $1"];
      if (q.is_active === "true") where.push("is_active = true");
      if (q.is_active === "false") where.push("is_active = false");
      if (q.search) {
        values.push(`%${q.search}%`);
        where.push(`(code ILIKE $${values.length} OR display_name ILIKE $${values.length} OR COALESCE(description, '') ILIKE $${values.length})`);
      }
      const whereSql = where.join(" AND ");
      const countRes = await client.query(`SELECT count(*)::text AS total FROM catalogs.qbo_categories WHERE ${whereSql}`, values);
      values.push(q.limit, q.offset);
      const rowsRes = await client.query(
        `
          SELECT id, code, display_name, description, metadata, is_active, sort_order, created_at, updated_at
          FROM catalogs.qbo_categories
          WHERE ${whereSql}
          ORDER BY sort_order ASC, code ASC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return { rows: rowsRes.rows, total: Number(countRes.rows[0]?.total ?? 0) };
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
    if (!parsedQuery.data.operating_company_id) return reply.code(400).send({ error: "operating_company_id_required" });

    const row = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT id, code, display_name, description, metadata, is_active, sort_order, created_at, updated_at
          FROM catalogs.qbo_categories
          WHERE id = $1 AND operating_company_id = $2
          LIMIT 1
        `,
        [parsedParams.data.id, parsedQuery.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "catalog_qbo_categories_not_found" });
    return row;
  });

  app.post(basePath, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
    if (!parsedQuery.data.operating_company_id) return reply.code(400).send({ error: "operating_company_id_required" });
    const parsedBody = createBody.safeParse(req.body ?? {});
    if (!parsedBody.success) return validationError(reply, parsedBody.error);
    const b = parsedBody.data;
    const created = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          INSERT INTO catalogs.qbo_categories (operating_company_id, code, display_name, description, metadata, is_active, sort_order)
          VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
          RETURNING id
        `,
        [parsedQuery.data.operating_company_id, b.code, b.display_name, b.description ?? null, JSON.stringify(b.metadata ?? {}), b.is_active, b.sort_order]
      );
      return res.rows[0]?.id as string;
    });
    return reply.code(201).send({ id: created });
  });

  app.patch(`${basePath}/:id`, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
    if (!parsedQuery.data.operating_company_id) return reply.code(400).send({ error: "operating_company_id_required" });
    const parsedBody = updateBody.safeParse(req.body ?? {});
    if (!parsedBody.success) return validationError(reply, parsedBody.error);
    const b = parsedBody.data;
    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (name: string, value: unknown) => {
      values.push(value);
      setParts.push(`${name} = $${values.length}`);
    };
    if (b.code !== undefined) add("code", b.code);
    if (b.display_name !== undefined) add("display_name", b.display_name);
    if (b.description !== undefined) add("description", b.description ?? null);
    if (b.metadata !== undefined) add("metadata", JSON.stringify(b.metadata ?? {}));
    if (b.is_active !== undefined) add("is_active", b.is_active);
    if (b.sort_order !== undefined) add("sort_order", b.sort_order);
    add("updated_at", new Date().toISOString());
    values.push(parsedParams.data.id, parsedQuery.data.operating_company_id);
    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE catalogs.qbo_categories
          SET ${setParts.join(", ")}
          WHERE id = $${values.length - 1} AND operating_company_id = $${values.length}
          RETURNING id
        `,
        values
      );
      return res.rows[0]?.id ?? null;
    });
    if (!updated) return reply.code(404).send({ error: "catalog_qbo_categories_not_found" });
    return { id: updated };
  });

  app.delete(`${basePath}/:id`, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
    if (!parsedQuery.data.operating_company_id) return reply.code(400).send({ error: "operating_company_id_required" });
    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE catalogs.qbo_categories
          SET is_active = false, updated_at = now()
          WHERE id = $1 AND operating_company_id = $2
          RETURNING id
        `,
        [parsedParams.data.id, parsedQuery.data.operating_company_id]
      );
      return res.rows[0]?.id ?? null;
    });
    if (!updated) return reply.code(404).send({ error: "catalog_qbo_categories_not_found" });
    return { ok: true };
  });
}

export function registerJournalEntryTypesReadOnlyRoutes(app: FastifyInstance) {
  const basePath = "/api/v1/catalogs/accounting/journal-entry-types";
  const rows = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      code: "GENERAL",
      display_name: "General Journal",
      description: "Manual and adjustment entries",
      metadata: { source: "code-defined" },
      is_active: true,
      sort_order: 10,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      code: "SALES_INVOICE",
      display_name: "Sales Invoice",
      description: "AR invoice posting entries",
      metadata: { source: "code-defined" },
      is_active: true,
      sort_order: 20,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      code: "PAYMENT_RECEIPT",
      display_name: "Payment Receipt",
      description: "Customer payment application entries",
      metadata: { source: "code-defined" },
      is_active: true,
      sort_order: 30,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    },
  ];

  app.get(basePath, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    return { rows, total: rows.length };
  });

  app.get(`${basePath}/:id`, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const row = rows.find((item) => item.id === parsedParams.data.id);
    if (!row) return reply.code(404).send({ error: "catalog_journal_entry_types_not_found" });
    return row;
  });

  app.post(basePath, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    return reply.code(405).send({ error: "catalog_read_only" });
  });

  app.patch(`${basePath}/:id`, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    return reply.code(405).send({ error: "catalog_read_only" });
  });

  app.delete(`${basePath}/:id`, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    return reply.code(405).send({ error: "catalog_read_only" });
  });
}
