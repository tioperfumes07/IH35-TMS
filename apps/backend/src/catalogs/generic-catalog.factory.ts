import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeAny } from "zod";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { isCatalogWriteRole } from "../auth/role-helpers.js";
import { getExcelUploadJob, processSpreadsheetUpload } from "./excel-uploader.js";
import { companyQuerySchema, currentAuthUser, idParamSchema, listQuerySchema, validationError } from "./fleet/shared.js";

export type GenericCatalogConfig = {
  catalogName: string;
  tableName: string;
  routePrefix: string;
  urlSegment: string;
  displayName: string;
  allowedColumns: string[];
  requiredColumns: string[];
  validators: Record<string, ZodTypeAny>;
  searchableColumns: string[];
  defaultSort: { column: string; dir: "asc" | "desc" };
  softDeleteColumn: "is_active" | "deactivated_at";
  columnMap?: Record<string, string>;
};

const tableNameGuard = /^[a-z_]+$/;
const urlSegmentGuard = /^[a-z0-9-]+$/;

function dbColumn(config: GenericCatalogConfig, column: string): string {
  return config.columnMap?.[column] ?? column;
}

function mapRowFromDb(config: GenericCatalogConfig, row: Record<string, unknown>) {
  const mapped: Record<string, unknown> = { ...row };
  if (config.columnMap) {
    for (const [apiColumn, dbColumnName] of Object.entries(config.columnMap)) {
      if (dbColumnName in row) {
        mapped[apiColumn] = row[dbColumnName];
      }
    }
  }
  return mapped;
}

export function createGenericCatalogRoutes(app: FastifyInstance, config: GenericCatalogConfig) {
  if (!tableNameGuard.test(config.tableName)) {
    throw new Error(`invalid_table_name_for_generic_catalog: ${config.tableName}`);
  }
  if (!urlSegmentGuard.test(config.urlSegment)) {
    throw new Error(`invalid_url_segment_for_generic_catalog: ${config.urlSegment}`);
  }

  const basePath = `${config.routePrefix}/${config.urlSegment}`;
  const sortColumn = dbColumn(config, config.defaultSort.column);
  const sortDir = config.defaultSort.dir.toUpperCase() === "DESC" ? "DESC" : "ASC";

  const createBodySchema = z
    .object(
      Object.fromEntries(
        Object.entries(config.validators).map(([column, schema]) => [column, schema])
      )
    )
    .strict();

  const updateBodySchema = createBodySchema.partial().refine((value) => Object.keys(value).length > 0, {
    message: "at least one field is required",
  });

  app.get(basePath, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    return withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const where: string[] = [];
      if (q.is_active === "true") where.push("t.is_active = true AND t.deactivated_at IS NULL");
      if (q.is_active === "false") where.push("(t.is_active = false OR t.deactivated_at IS NOT NULL)");
      if (q.search && config.searchableColumns.length > 0) {
        values.push(`%${q.search}%`);
        const searchClauses = config.searchableColumns.map(
          (column) => `t.${dbColumn(config, column)}::text ILIKE $${values.length}`
        );
        where.push(`(${searchClauses.join(" OR ")})`);
      }
      const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const countRes = await client.query(
        `SELECT count(*)::text AS total FROM catalogs.${config.tableName} t ${whereClause}`,
        values
      );
      values.push(q.limit, q.offset);
      const selectColumns = ["id", ...config.allowedColumns, "created_at", "updated_at"]
        .map((column) => {
          const mapped = dbColumn(config, column);
          return mapped === column ? `t.${column}` : `t.${mapped} AS ${column}`;
        })
        .join(", ");
      const rowsRes = await client.query(
        `
          SELECT ${selectColumns}
          FROM catalogs.${config.tableName} t
          ${whereClause}
          ORDER BY t.${sortColumn} ${sortDir}, t.id ASC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return {
        catalog_name: config.catalogName,
        rows: rowsRes.rows.map((row) => mapRowFromDb(config, row)),
        total: Number((countRes.rows[0] as { total?: string } | undefined)?.total ?? 0),
      };
    });
  });

  app.post(basePath, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedBody = createBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return validationError(reply, parsedBody.error);
    const body = parsedBody.data;

    const created = await withCurrentUser(authUser.uuid, async (client) => {
      const columns = Object.keys(body).map((column) => dbColumn(config, column));
      const values = Object.values(body);
      const placeholders = values.map((_, index) => `$${index + 1}`);
      const res = await client.query(
        `
          INSERT INTO catalogs.${config.tableName} (${columns.join(", ")}, created_by_user_id, updated_by_user_id)
          VALUES (${placeholders.join(", ")}, $${values.length + 1}, $${values.length + 1})
          RETURNING *
        `,
        [...values, authUser.uuid]
      );
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, `catalogs.${config.tableName}_created`, {
        resource_id: row.id,
        resource_type: config.catalogName,
        catalog_display_name: config.displayName,
      });
      return mapRowFromDb(config, row);
    });

    return reply.code(201).send(created);
  });

  app.patch(`${basePath}/:id`, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedBody = updateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return validationError(reply, parsedBody.error);
    const body = parsedBody.data;

    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      const fields: string[] = [];
      const values: unknown[] = [];
      for (const [column, value] of Object.entries(body)) {
        values.push(value);
        fields.push(`${dbColumn(config, column)} = $${values.length}`);
      }
      if (config.softDeleteColumn === "is_active" && "is_active" in body && body.is_active === false) {
        values.push(new Date().toISOString());
        fields.push(`deactivated_at = $${values.length}`);
      }
      if (config.softDeleteColumn === "is_active" && "is_active" in body && body.is_active === true) {
        fields.push("deactivated_at = NULL");
      }
      values.push(authUser.uuid);
      fields.push(`updated_by_user_id = $${values.length}`);
      values.push(parsedParams.data.id);
      const res = await client.query(
        `
          UPDATE catalogs.${config.tableName}
          SET ${fields.join(", ")}, updated_at = now()
          WHERE id = $${values.length}
          RETURNING *
        `,
        values
      );
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, `catalogs.${config.tableName}_updated`, {
        resource_id: row.id,
        resource_type: config.catalogName,
        catalog_display_name: config.displayName,
      });
      return mapRowFromDb(config, row);
    });

    if (!updated) return reply.code(404).send({ error: `catalog_${config.tableName}_not_found` });
    return updated;
  });

  app.delete(`${basePath}/:id`, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);

    const archived = await withCurrentUser(authUser.uuid, async (client) => {
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
      await appendCrudAudit(client, authUser.uuid, `catalogs.${config.tableName}_archived`, {
        resource_id: res.rows[0].id,
        resource_type: config.catalogName,
        catalog_display_name: config.displayName,
      });
      return { ok: true };
    });

    if (!archived) return reply.code(404).send({ error: `catalog_${config.tableName}_not_found` });
    return archived;
  });

  app.post(`${basePath}/:id/restore`, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);

    const restored = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE catalogs.${config.tableName}
          SET is_active = true,
              deactivated_at = NULL,
              updated_at = now(),
              updated_by_user_id = $2
          WHERE id = $1
          RETURNING id
        `,
        [parsedParams.data.id, authUser.uuid]
      );
      if (res.rows.length === 0) return null;
      await appendCrudAudit(client, authUser.uuid, `catalogs.${config.tableName}_restored`, {
        resource_id: res.rows[0].id,
        resource_type: config.catalogName,
        catalog_display_name: config.displayName,
      });
      return { ok: true };
    });

    if (!restored) return reply.code(404).send({ error: `catalog_${config.tableName}_not_found` });
    return restored;
  });

  app.get(`${basePath}/export.csv`, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;

    const csv = await withCurrentUser(authUser.uuid, async (client) => {
      const selectColumns = config.allowedColumns.map((column) => dbColumn(config, column)).join(", ");
      const res = await client.query(
        `
          SELECT ${selectColumns}
          FROM catalogs.${config.tableName}
          WHERE is_active = true AND deactivated_at IS NULL
          ORDER BY ${sortColumn} ${sortDir}
        `
      );
      const header = config.allowedColumns.join(",");
      const lines = res.rows.map((row) =>
        config.allowedColumns
          .map((column) => {
            const value = row[dbColumn(config, column)];
            const text = value == null ? "" : String(value);
            return `"${text.replaceAll('"', '""')}"`;
          })
          .join(",")
      );
      return [header, ...lines].join("\n");
    });

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${config.urlSegment}.csv"`);
    return reply.send(csv);
  });

  app.post(`${basePath}/import`, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const filePart = await req.file();
    if (!filePart) return reply.code(400).send({ error: "file_required" });
    const buffer = await filePart.toBuffer();
    const filename = filePart.filename;

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      return processSpreadsheetUpload({
        client,
        catalogName: config.catalogName,
        buffer,
        filename,
        allowedColumns: config.allowedColumns,
        requiredColumns: config.requiredColumns,
        validators: config.validators,
        insertRow: async (row) => {
          const columns = Object.keys(row).map((column) => dbColumn(config, column));
          const values = Object.values(row);
          const placeholders = values.map((_, index) => `$${index + 1}`);
          await client.query(
            `
              INSERT INTO catalogs.${config.tableName} (${columns.join(", ")}, created_by_user_id, updated_by_user_id)
              VALUES (${placeholders.join(", ")}, $${values.length + 1}, $${values.length + 1})
            `,
            [...values, authUser.uuid]
          );
        },
      });
    });

    return reply.code(202).send(result);
  });
}

export function registerExcelUploadJobRoute(app: FastifyInstance) {
  app.get("/api/v1/catalogs/excel-upload-jobs/:id", async (req, reply) => {
    const authUser = currentAuthUser(req as FastifyRequest, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);

    const job = await withCurrentUser(authUser.uuid, async (client) => getExcelUploadJob(client, parsedParams.data.id));
    if (!job) return reply.code(404).send({ error: "excel_upload_job_not_found" });
    return job;
  });
}
