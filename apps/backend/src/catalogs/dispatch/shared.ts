import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit, buildPatchChanges } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type CatalogRouteOptions = {
  catalogPath: string;
  tableName: "load_types" | "detention_reasons" | "pickup_time_types" | "additional_charges";
  auditKey: "load_types" | "detention_reasons" | "pickup_time_types" | "additional_charges";
};

export const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  search: z.string().trim().min(1).max(120).optional(),
  is_active: z.enum(["true", "false", "all"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).max(10000).optional(),
});

const metadataSchema = z.record(z.string(), z.unknown()).default({});

const createSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9-]+$/, "code must match /^[A-Z][A-Z0-9-]+$/"),
  display_name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional().nullable(),
  sort_order: z.number().int().min(0).max(10000).default(50),
  metadata: metadataSchema,
});

const updateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9-]+$/, "code must match /^[A-Z][A-Z0-9-]+$/")
      .optional(),
    display_name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(500).optional().nullable(),
    sort_order: z.number().int().min(0).max(10000).optional(),
    metadata: metadataSchema.optional(),
    is_active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

export function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: DbClient) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client as DbClient);
  });
}

function parseCompanyScope(req: FastifyRequest, reply: FastifyReply) {
  const parsed = companyQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    validationError(reply, parsed.error);
    return null;
  }
  return parsed.data.operating_company_id;
}

function maybeCodeConflict(reply: FastifyReply, error: unknown) {
  if ((error as { code?: string }).code !== "23505") return false;
  reply.code(400).send({
    error: "validation_error",
    details: {
      fieldErrors: {
        code: ["Code already exists for this operating company"],
      },
      formErrors: [],
    },
  });
  return true;
}

export function registerDispatchCatalogCrudRoutes(app: FastifyInstance, options: CatalogRouteOptions) {
  const basePath = `/api/v1/catalogs/dispatch/${options.catalogPath}`;
  const tableName = `catalogs.${options.tableName}`;

  app.get(basePath, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const result = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      const values: unknown[] = [q.operating_company_id];
      const filters: string[] = ["operating_company_id = $1"];

      if (q.search) {
        values.push(`%${q.search}%`);
        const idx = values.length;
        filters.push(`(code ILIKE $${idx} OR display_name ILIKE $${idx})`);
      }
      if (!q.is_active || q.is_active === "true") {
        filters.push("is_active = true");
      } else if (q.is_active === "false") {
        filters.push("is_active = false");
      }

      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const limit = q.limit ?? 100;
      const offset = q.offset ?? 0;
      const listValues = [...values, limit, offset];
      const limitParam = listValues.length - 1;
      const offsetParam = listValues.length;

      const rowsRes = await client.query(
        `
          SELECT id, operating_company_id, code, display_name, description, metadata, is_active, sort_order, created_at, updated_at
          FROM ${tableName}
          ${whereClause}
          ORDER BY sort_order ASC, display_name ASC
          LIMIT $${limitParam} OFFSET $${offsetParam}
        `,
        listValues
      );
      const totalRes = await client.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM ${tableName} ${whereClause}`, values);
      return { rows: rowsRes.rows, total: Number(totalRes.rows[0]?.n ?? "0") };
    }).catch((e: unknown) => {
      // W-2 (catalogs prod-shape drift): surface the underlying pg error so a prod-only failure (a missing
      // column / grant / RLS on catalogs.<catalog>) is DIAGNOSABLE from the live response + logs, instead of
      // a blind 500. pg_code names the category without leaking row data: 42703 undefined_column,
      // 42501 insufficient_privilege, 42P01 undefined_table. From-migrations DBs (e2e) return 200 and never
      // reach here — this only trips on a prod schema that drifted from the migrations.
      const pgCode = e && typeof e === "object" && "code" in e ? String((e as { code?: unknown }).code ?? "") : null;
      req.log.error(
        { err: e, catalog: options.catalogPath, operating_company_id: q.operating_company_id, pg_code: pgCode },
        "dispatch catalog list query failed"
      );
      reply.code(500).send({ error: "catalog_query_failed", catalog: options.catalogPath, pg_code: pgCode });
      return null;
    });

    if (result === null) return; // error response already sent in the catch above
    return result;
  });

  app.get(`${basePath}/:id`, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const operatingCompanyId = parseCompanyScope(req, reply);
    if (!operatingCompanyId) return;

    const row = await withCompanyScope(user.uuid, operatingCompanyId, async (client) => {
      const res = await client.query(
        `
          SELECT id, operating_company_id, code, display_name, description, metadata, is_active, sort_order, created_at, updated_at
          FROM ${tableName}
          WHERE operating_company_id = $1
            AND id = $2
          LIMIT 1
        `,
        [operatingCompanyId, params.data.id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "not_found" });
    return row;
  });

  app.post(basePath, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const operatingCompanyId = parseCompanyScope(req, reply);
    if (!operatingCompanyId) return;
    const body = createSchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const created = await withCompanyScope(user.uuid, operatingCompanyId, async (client) => {
        const res = await client.query(
          `
            INSERT INTO ${tableName} (operating_company_id, code, display_name, description, sort_order, metadata)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb)
            RETURNING id, operating_company_id, code, display_name, description, metadata, is_active, sort_order, created_at, updated_at
          `,
          [operatingCompanyId, body.data.code, body.data.display_name, body.data.description ?? null, body.data.sort_order, JSON.stringify(body.data.metadata ?? {})]
        );
        const row = res.rows[0] as Record<string, unknown>;
        await appendCrudAudit(
          client,
          user.uuid,
          `catalogs.${options.auditKey}_created`,
          {
            resource_id: row.id,
            resource_type: tableName,
            operating_company_id: operatingCompanyId,
            code: row.code,
          },
          "info",
          "P3-T11.21.3A"
        );
        return row;
      });
      return reply.code(201).send(created);
    } catch (error) {
      if (maybeCodeConflict(reply, error)) return;
      throw error;
    }
  });

  app.patch(`${basePath}/:id`, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const operatingCompanyId = parseCompanyScope(req, reply);
    if (!operatingCompanyId) return;
    const body = updateSchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const patch = body.data;
    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown) => {
      values.push(value);
      fields.push(`${column} = $${values.length}`);
    };

    if (patch.code !== undefined) add("code", patch.code);
    if (patch.display_name !== undefined) add("display_name", patch.display_name);
    if (patch.description !== undefined) add("description", patch.description ?? null);
    if (patch.sort_order !== undefined) add("sort_order", patch.sort_order);
    if (patch.metadata !== undefined) add("metadata", JSON.stringify(patch.metadata));
    if (patch.is_active !== undefined) add("is_active", patch.is_active);

    fields.push("updated_at = now()");

    try {
      const updated = await withCompanyScope(user.uuid, operatingCompanyId, async (client) => {
        const oldRes = await client.query(
          `
            SELECT id, operating_company_id, code, display_name, description, metadata, is_active, sort_order, created_at, updated_at
            FROM ${tableName}
            WHERE operating_company_id = $1
              AND id = $2
            LIMIT 1
          `,
          [operatingCompanyId, params.data.id]
        );
        const oldRow = (oldRes.rows[0] ?? null) as Record<string, unknown> | null;
        if (!oldRow) return null;

        values.push(operatingCompanyId, params.data.id);
        const companyIdx = values.length - 1;
        const idIdx = values.length;
        const res = await client.query(
          `
            UPDATE ${tableName}
            SET ${fields.join(", ")}
            WHERE operating_company_id = $${companyIdx}
              AND id = $${idIdx}
            RETURNING id, operating_company_id, code, display_name, description, metadata, is_active, sort_order, created_at, updated_at
          `,
          values
        );
        const row = (res.rows[0] ?? null) as Record<string, unknown> | null;
        if (!row) return null;

        const changes = buildPatchChanges(patch as Record<string, unknown>, oldRow, row);
        await appendCrudAudit(
          client,
          user.uuid,
          `catalogs.${options.auditKey}_updated`,
          {
            resource_id: row.id,
            resource_type: tableName,
            operating_company_id: operatingCompanyId,
            changes,
          },
          "info",
          "P3-T11.21.3A"
        );
        return row;
      });

      if (!updated) return reply.code(404).send({ error: "not_found" });
      return updated;
    } catch (error) {
      if (maybeCodeConflict(reply, error)) return;
      throw error;
    }
  });

  app.delete(`${basePath}/:id`, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const operatingCompanyId = parseCompanyScope(req, reply);
    if (!operatingCompanyId) return;

    const deactivated = await withCompanyScope(user.uuid, operatingCompanyId, async (client) => {
      const res = await client.query(
        `
          UPDATE ${tableName}
          SET is_active = false,
              updated_at = now()
          WHERE operating_company_id = $1
            AND id = $2
          RETURNING id, operating_company_id, code, display_name, description, metadata, is_active, sort_order, created_at, updated_at
        `,
        [operatingCompanyId, params.data.id]
      );
      const row = (res.rows[0] ?? null) as Record<string, unknown> | null;
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        `catalogs.${options.auditKey}_deactivated`,
        {
          resource_id: row.id,
          resource_type: tableName,
          operating_company_id: operatingCompanyId,
          code: row.code,
        },
        "warning",
        "P3-T11.21.3A"
      );
      return row;
    });

    if (!deactivated) return reply.code(404).send({ error: "not_found" });
    return deactivated;
  });
}
