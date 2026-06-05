import type { FastifyInstance } from "fastify";
import { z, type ZodSchema } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { isCatalogWriteRole } from "../auth/role-helpers.js";
import {
  createExcelUploadJob,
  mapSpreadsheetRows,
  parseSpreadsheetBuffer,
  processCatalogImportJob,
  type CatalogImportConfig,
} from "./excel-uploader.js";
import { companyQuerySchema, currentAuthUser, idParamSchema, listQuerySchema, validationError } from "./fleet/shared.js";

export type GenericCatalogConfig = {
  catalogName: string;
  tableName: string;
  routePrefix: string;
  urlSegment: string;
  displayName: string;
  allowedColumns: string[];
  requiredColumns: string[];
  validators: Record<string, ZodSchema>;
  searchableColumns: string[];
  defaultSort: { column: string; dir: "asc" | "desc" };
  softDeleteColumn: string;
  codeRegex?: RegExp;
  readOnly?: boolean;
};

type RouteMode = "all" | "extensions";

const tableNameGuard = /^[a-z_]+$/;
const urlSegmentGuard = /^[a-z-]+$/;
const columnGuard = /^[a-z_]+$/;

function dbColumnForApiColumn(column: string): string {
  if (column === "display_name") return "name";
  return column;
}

function apiColumnForDbColumn(column: string): string {
  if (column === "name") return "display_name";
  return column;
}

function escapeCsvValue(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toImportConfig(config: GenericCatalogConfig): CatalogImportConfig {
  return {
    catalogName: config.catalogName,
    tableName: config.tableName,
    allowedColumns: config.allowedColumns,
    requiredColumns: config.requiredColumns,
    validators: config.validators,
    columnAliases: {
      name: "display_name",
      display_name: "display_name",
    },
  };
}

export function createCatalogRoutes(
  app: FastifyInstance,
  config: GenericCatalogConfig,
  options: { mode?: RouteMode } = {}
) {
  const mode = options.mode ?? "all";
  if (!tableNameGuard.test(config.tableName)) throw new Error(`invalid_table_name_for_catalog_factory: ${config.tableName}`);
  if (!urlSegmentGuard.test(config.urlSegment)) throw new Error(`invalid_url_segment_for_catalog_factory: ${config.urlSegment}`);
  for (const column of [...config.allowedColumns, ...config.searchableColumns, config.defaultSort.column, config.softDeleteColumn]) {
    if (!columnGuard.test(column) && column !== "display_name") {
      throw new Error(`invalid_column_for_catalog_factory: ${column}`);
    }
  }

  const basePath = `${config.routePrefix}/${config.urlSegment}`;
  const createShape: Record<string, ZodSchema> = {};
  const updateShape: Record<string, ZodSchema> = {};
  for (const column of config.allowedColumns) {
    const validator = config.validators[column];
    if (!validator) continue;
    createShape[column] = validator;
    updateShape[column] = validator.optional();
  }
  const createBodySchema = z.object(createShape);
  const updateBodySchema = z
    .object(updateShape)
    .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

  const selectColumns = [
    "t.id",
    ...config.allowedColumns.map((column) => {
      const dbColumn = dbColumnForApiColumn(column);
      const apiColumn = apiColumnForDbColumn(dbColumn);
      return `t.${dbColumn} AS ${apiColumn}`;
    }),
    "t.created_at",
    "t.updated_at",
  ];

  const sortColumn = dbColumnForApiColumn(config.defaultSort.column);
  const sortDir = config.defaultSort.dir.toUpperCase() === "DESC" ? "DESC" : "ASC";

  if (mode === "all" || mode === "extensions") {
    if (mode === "all") {
      app.get(basePath, async (req, reply) => {
        const authUser = currentAuthUser(req, reply);
        if (!authUser) return;
        const parsed = listQuerySchema.safeParse(req.query ?? {});
        if (!parsed.success) return validationError(reply, parsed.error);
        const q = parsed.data;

        const payload = await withCurrentUser(authUser.uuid, async (client) => {
          const values: unknown[] = [];
          const where: string[] = [];
          if (q.is_active === "true") where.push(`t.${config.softDeleteColumn} = true AND t.deactivated_at IS NULL`);
          if (q.is_active === "false") where.push(`(t.${config.softDeleteColumn} = false OR t.deactivated_at IS NOT NULL)`);
          if (q.search && config.searchableColumns.length > 0) {
            values.push(`%${q.search}%`);
            const searchClauses = config.searchableColumns.map((column) => {
              const dbColumn = dbColumnForApiColumn(column);
              return `COALESCE(t.${dbColumn}::text, '') ILIKE $${values.length}`;
            });
            where.push(`(${searchClauses.join(" OR ")})`);
          }
          const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

          const countRes = await client.query(
            `SELECT count(*)::text AS total FROM catalogs.${config.tableName} t ${whereClause}`,
            values
          );
          values.push(q.limit, q.offset);
          const rowsRes = await client.query(
            `
              SELECT ${selectColumns.join(", ")}
              FROM catalogs.${config.tableName} t
              ${whereClause}
              ORDER BY t.${sortColumn} ${sortDir}, t.code ASC
              LIMIT $${values.length - 1}
              OFFSET $${values.length}
            `,
            values
          );
          return { rows: rowsRes.rows, total: Number((countRes.rows[0] as { total?: string } | undefined)?.total ?? 0) };
        });

        return payload;
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
        const body = parsedBody.data;

        const created = await withCurrentUser(authUser.uuid, async (client) => {
          if ("code" in body && body.code) {
            const conflict = await client.query(`SELECT id FROM catalogs.${config.tableName} WHERE code = $1 LIMIT 1`, [body.code]);
            if (conflict.rows.length > 0) return { error: `catalog_${config.tableName}_code_conflict` as const };
          }

          const insertColumns = ["created_by_user_id", "updated_by_user_id"];
          const insertValues: unknown[] = [authUser.uuid, authUser.uuid];
          const placeholders = ["$1", "$2"];
          let paramIndex = 3;
          for (const column of config.allowedColumns) {
            if (!(column in body)) continue;
            insertColumns.push(dbColumnForApiColumn(column));
            insertValues.push(body[column as keyof typeof body]);
            placeholders.push(`$${paramIndex}`);
            paramIndex += 1;
          }

          const res = await client.query(
            `
              INSERT INTO catalogs.${config.tableName} (${insertColumns.join(", ")})
              VALUES (${placeholders.join(", ")})
              RETURNING ${selectColumns.join(", ").replaceAll("t.", "")}
            `,
            insertValues
          );
          const row = res.rows[0];
          await appendCrudAudit(client, authUser.uuid, `catalogs.${config.tableName}_created`, {
            resource_id: row.id,
            resource_type: `catalogs.${config.tableName}`,
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
        const body = parsedBody.data;

        const updated = await withCurrentUser(authUser.uuid, async (client) => {
          if ("code" in body && body.code) {
            const conflict = await client.query(`SELECT id FROM catalogs.${config.tableName} WHERE code = $1 AND id <> $2 LIMIT 1`, [
              body.code,
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

          for (const column of config.allowedColumns) {
            if (!(column in body)) continue;
            add(dbColumnForApiColumn(column), body[column as keyof typeof body]);
          }
          if (config.softDeleteColumn in body && body[config.softDeleteColumn as keyof typeof body] === false) {
            add("deactivated_at", new Date().toISOString());
          }
          if (config.softDeleteColumn in body && body[config.softDeleteColumn as keyof typeof body] === true) {
            add("deactivated_at", null);
          }
          add("updated_at", new Date().toISOString());
          add("updated_by_user_id", authUser.uuid);
          values.push(parsedParams.data.id);

          const res = await client.query(
            `
              UPDATE catalogs.${config.tableName}
              SET ${fields.join(", ")}
              WHERE id = $${values.length}
              RETURNING ${selectColumns.join(", ").replaceAll("t.", "")}
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
              SET ${config.softDeleteColumn} = false,
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

    app.post(`${basePath}/:id/restore`, async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return;
      if (config.readOnly) return reply.code(405).send({ error: "catalog_read_only" });
      if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
      const parsedParams = idParamSchema.safeParse(req.params ?? {});
      if (!parsedParams.success) return validationError(reply, parsedParams.error);
      const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
      if (!parsedQuery.success) return validationError(reply, parsedQuery.error);

      const restored = await withCurrentUser(authUser.uuid, async (client) => {
        const res = await client.query(
          `
            UPDATE catalogs.${config.tableName}
            SET ${config.softDeleteColumn} = true,
                deactivated_at = NULL,
                updated_at = now(),
                updated_by_user_id = $2
            WHERE id = $1
            RETURNING ${selectColumns.join(", ").replaceAll("t.", "")}
          `,
          [parsedParams.data.id, authUser.uuid]
        );
        if (res.rows.length === 0) return null;
        const row = res.rows[0];
        await appendCrudAudit(client, authUser.uuid, `catalogs.${config.tableName}_restored`, {
          resource_id: row.id,
          resource_type: `catalogs.${config.tableName}`,
          catalog_display_name: config.displayName,
        });
        return row;
      });

      if (!restored) return reply.code(404).send({ error: `catalog_${config.tableName}_not_found` });
      return restored;
    });

    app.get(`${basePath}/export.csv`, async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return;
      const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
      if (!parsedQuery.success) return validationError(reply, parsedQuery.error);

      const rows = await withCurrentUser(authUser.uuid, async (client) => {
        const res = await client.query(
          `
            SELECT ${selectColumns.join(", ").replaceAll("t.", "")}
            FROM catalogs.${config.tableName} t
            ORDER BY t.${sortColumn} ${sortDir}, t.code ASC
          `
        );
        return res.rows;
      });

      const header = config.allowedColumns.join(",");
      const lines = rows.map((row) =>
        config.allowedColumns.map((column) => escapeCsvValue((row as Record<string, unknown>)[column])).join(",")
      );
      const csv = `${header}\n${lines.join("\n")}\n`;
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="${config.urlSegment}.csv"`)
        .send(csv);
    });

    app.post(`${basePath}/import`, async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return;
      if (config.readOnly) return reply.code(405).send({ error: "catalog_read_only" });
      if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
      const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
      if (!parsedQuery.success) return validationError(reply, parsedQuery.error);

      let fileBuffer: Buffer | null = null;
      let filename = "upload.xlsx";
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === "file" && part.fieldname === "file") {
          fileBuffer = await part.toBuffer();
          filename = part.filename ?? filename;
          break;
        }
      }
      if (!fileBuffer) return reply.code(400).send({ error: "file_required" });

      let rawRows: Array<Record<string, unknown>>;
      try {
        rawRows = parseSpreadsheetBuffer(fileBuffer, filename);
      } catch {
        return reply.code(400).send({ error: "unsupported_file_type" });
      }

      const importConfig = toImportConfig(config);
      const mapped = mapSpreadsheetRows(rawRows, importConfig);
      if (mapped.missingRequiredColumns.length > 0) {
        return reply.code(400).send({
          error: "missing_required_columns",
          columns: mapped.missingRequiredColumns,
        });
      }

      const job = await withCurrentUser(authUser.uuid, async (client) => {
        const createdJob = await createExcelUploadJob(client, config.catalogName, filename);
        return processCatalogImportJob(client, createdJob.id, importConfig, mapped.rows, authUser.uuid);
      });

      return reply.code(202).send({ job_id: job.id, status: job.status, rows_total: job.rows_total, rows_succeeded: job.rows_succeeded, rows_failed: job.rows_failed });
    });
  }
}
