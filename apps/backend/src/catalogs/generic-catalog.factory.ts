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
import {
  companyQuerySchema,
  companyScopedCompanyQuerySchema,
  companyScopedListQuerySchema,
  currentAuthUser,
  idParamSchema,
  listQuerySchema,
  validationError,
  withCompanyScope,
} from "./fleet/shared.js";

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
  /**
   * Boolean soft-active column (usually `is_active`). Omit / null when the table has no active flag
   * (e.g. catalogs.audit_event_types — only code/description/severity_default/created_at). A text
   * placeholder here caused live `text = boolean` 500s (operator 42883).
   */
  softDeleteColumn?: string | null;
  /** Whether the physical table carries a deactivated_at column for soft-delete audit. */
  hasDeactivatedAt: boolean;
  /**
   * Whether the physical table carries `updated_at`. Default true. Global taxonomies like
   * catalogs.account_types / audit_event_types only have created_at — selecting t.updated_at
   * 500s the Lists card (LST Account Types load fail).
   */
  hasUpdatedAt?: boolean;
  /**
   * Whether the physical table carries `created_by_user_id` / `updated_by_user_id`. Defaults to
   * `hasUpdatedAt`'s value (the common shape) — but the two CAN diverge: catalogs.cash_advance_types
   * has a real `updated_at` column with no accompanying `_by_user_id` audit columns at all. Writing
   * them unconditionally there 500s every Create/Edit with a raw `column "updated_by_user_id" of
   * relation "cash_advance_types" does not exist` (42703) surfaced straight to the operator
   * (LST-CASH-ADVANCE-TYPES-500). Set explicitly to false for any catalog missing these columns.
   */
  hasAuditUserColumns?: boolean;
  codeRegex?: RegExp;
  readOnly?: boolean;
  /**
   * When true, every list/create/update requires operating_company_id, runs under withCompanyScope
   * (membership + app.operating_company_id GUC), and CREATE inserts operating_company_id.
   * Required for FORCE-RLS per-entity catalogs — without it INSERTs omit the NOT NULL column and
   * SELECTs return 0 under company_scope.
   */
  entityScoped?: boolean;
  /**
   * Physical column that holds the catalog's CODE, when it is not literally `code`.
   * catalogs.labor_rates uses rate_code; catalogs.maintenance_part_locations uses location_code.
   */
  codeColumn?: string;
  /**
   * Physical column that holds the catalog's DISPLAY NAME, when it is neither `display_name` nor
   * `name` (e.g. rate_name, location_name).
   *
   * This exists so a domain-named catalog can be served WITHOUT adding synonym columns to its table.
   * Adding a second `display_name` alongside `rate_name` would put the same fact in two places and
   * invite them to drift — the split-brain that made catalogs.vendor_types need a sync trigger. An
   * alias keeps ONE physical column as the truth.
   */
  displayNameColumn?: string;
  /**
   * CATALOG-AUDIT-EVENT-TYPES-GET-500: physical column that serves as the row's stable identifier,
   * when the table has no literal `id` column. Defaults to `"id"`. The list SELECT used to hardcode
   * `t.id` unconditionally — exactly the same class of bug `hasUpdatedAt` already exists to prevent
   * for `updated_at` (see above) — so catalogs.audit_event_types (code/description/severity_default/
   * created_at only, no `id` at all) 500'd every load with a raw `column t.id does not exist` (42703).
   * Set to the table's natural key (e.g. `"code"`) for a catalog with no surrogate id column; the
   * value is aliased AS `id` in the API response so every other consumer is unaffected.
   */
  idColumn?: string;
};

type RouteMode = "all" | "extensions";

const tableNameGuard = /^[a-z_]+$/;
const urlSegmentGuard = /^[a-z-]+$/;
const columnGuard = /^[a-z_]+$/;

// Only these two catalogs are intentionally global. Every other table registered through this
// factory is company-owned on the live schema and FORCE RLS. Defaulting an omitted flag to global
// made those routes execute without app.operating_company_id and return a dishonest HTTP 200 empty.
const GLOBAL_CATALOG_TABLES = new Set(["account_types", "audit_event_types"]);

export function isEntityScopedCatalog(config: GenericCatalogConfig): boolean {
  if (config.entityScoped === false && !GLOBAL_CATALOG_TABLES.has(config.tableName)) {
    throw new Error(`entity_scoped_catalog_cannot_be_global: catalogs.${config.tableName}`);
  }
  return config.entityScoped ?? !GLOBAL_CATALOG_TABLES.has(config.tableName);
}

/** API column -> physical column, honouring the per-catalog aliases. */
function dbColumnForApiColumn(column: string, config?: GenericCatalogConfig): string {
  // LV-CAT-500: the previous default `name` broke tables whose physical display-name column
  // is actually `display_name` (vendor_types, customer_types, lumper_providers, …). Default to
  // identity and let configs whose physical column is `name` declare it explicitly.
  if (column === "display_name") return config?.displayNameColumn ?? "display_name";
  if (column === "code" && config?.codeColumn) return config.codeColumn;
  return column;
}

/** Physical column -> API column (the inverse). */
function apiColumnForDbColumn(column: string, config?: GenericCatalogConfig): string {
  if (config?.displayNameColumn && column === config.displayNameColumn) return "display_name";
  if (config?.codeColumn && column === config.codeColumn) return "code";
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
      ...(config.displayNameColumn ? { [config.displayNameColumn]: "display_name" } : {}),
      ...(config.codeColumn ? { [config.codeColumn]: "code" } : {}),
    },
  };
}

export function createCatalogRoutes(
  app: FastifyInstance,
  config: GenericCatalogConfig,
  options: { mode?: RouteMode } = {}
) {
  const mode = options.mode ?? "all";
  const entityScoped = isEntityScopedCatalog(config);
  if (!tableNameGuard.test(config.tableName)) throw new Error(`invalid_table_name_for_catalog_factory: ${config.tableName}`);
  if (!urlSegmentGuard.test(config.urlSegment)) throw new Error(`invalid_url_segment_for_catalog_factory: ${config.urlSegment}`);
  for (const column of [
    ...config.allowedColumns,
    ...config.searchableColumns,
    config.defaultSort.column,
    ...(config.softDeleteColumn ? [config.softDeleteColumn] : []),
    ...(config.idColumn ? [config.idColumn] : []),
  ]) {
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

  const hasUpdatedAt = config.hasUpdatedAt !== false;
  const hasAuditUserColumns = config.hasAuditUserColumns ?? hasUpdatedAt;
  const idDbColumn = config.idColumn ?? "id";
  const selectColumns = [
    `t.${idDbColumn} AS id`,
    ...config.allowedColumns.map((column) => {
      const dbColumn = dbColumnForApiColumn(column, config);
      const apiColumn = apiColumnForDbColumn(dbColumn, config);
      return `t.${dbColumn} AS ${apiColumn}`;
    }),
    "t.created_at",
    // LST-ACCOUNT-TYPES-LOAD: account_types / audit_event_types have created_at only — never
    // invent a physical updated_at reference (Postgres 42703 → Lists card load failure).
    hasUpdatedAt ? "t.updated_at" : "NULL::timestamptz AS updated_at",
  ];

  const sortColumn = dbColumnForApiColumn(config.defaultSort.column, config);
  // LV-CAT-500 secondary tie-break: never hardcode `t.code` — alias catalogs use rate_code /
  // location_code / etc. Bare `t.code ASC` 500s (42703) on labor_rates + maintenance_part_locations.
  const codeSortColumn = dbColumnForApiColumn("code", config);
  const sortDir = config.defaultSort.dir.toUpperCase() === "DESC" ? "DESC" : "ASC";

  if (mode === "all" || mode === "extensions") {
    if (mode === "all") {
      app.get(basePath, async (req, reply) => {
        const authUser = currentAuthUser(req, reply);
        if (!authUser) return reply;
        const parsed = (entityScoped ? companyScopedListQuerySchema : listQuerySchema).safeParse(req.query ?? {});
        if (!parsed.success) return validationError(reply, parsed.error);
        const q = parsed.data;

        const runList = async (client: any) => {
          const values: unknown[] = [];
          const where: string[] = [];
          if (entityScoped) {
            values.push(q.operating_company_id);
            where.push(`t.operating_company_id = $${values.length}::uuid`);
          }
          const softCol = config.softDeleteColumn?.trim();
          if (softCol) {
            if (q.is_active === "true") {
              where.push(
                config.hasDeactivatedAt
                  ? `t.${softCol} = true AND t.deactivated_at IS NULL`
                  : `t.${softCol} = true`,
              );
            }
            if (q.is_active === "false") {
              where.push(
                config.hasDeactivatedAt
                  ? `(t.${softCol} = false OR t.deactivated_at IS NOT NULL)`
                  : `t.${softCol} = false`,
              );
            }
          }
          if (q.search && config.searchableColumns.length > 0) {
            values.push(`%${q.search}%`);
            const searchClauses = config.searchableColumns.map((column) => {
              const dbColumn = dbColumnForApiColumn(column, config);
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
              ORDER BY t.${sortColumn} ${sortDir}, t.${codeSortColumn} ASC
              LIMIT $${values.length - 1}
              OFFSET $${values.length}
            `,
            values
          );
          return { rows: rowsRes.rows, total: Number((countRes.rows[0] as { total?: string } | undefined)?.total ?? 0) };
        };

        if (entityScoped) {
          return withCompanyScope(authUser.uuid, q.operating_company_id as string, runList);
        }
        return withCurrentUser(authUser.uuid, runList);
      });

      app.post(basePath, async (req, reply) => {
        const authUser = currentAuthUser(req, reply);
        if (!authUser) return reply;
        if (config.readOnly) return reply.code(405).send({ error: "catalog_read_only" });
        if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
        const parsedQuery = (entityScoped ? companyScopedCompanyQuerySchema : companyQuerySchema).safeParse(
          req.query ?? {}
        );
        if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
        const parsedBody = createBodySchema.safeParse(req.body ?? {});
        if (!parsedBody.success) return validationError(reply, parsedBody.error);
        const body = parsedBody.data;
        const operatingCompanyId = parsedQuery.data.operating_company_id as string | undefined;

        const runCreate = async (client: any) => {
          if ("code" in body && body.code) {
            // CLS-CATALOG-CODE-CONFLICT-COLUMN: this conflict pre-check must go through
            // dbColumnForApiColumn like every other read/write below it — a bare `code` 42703s
            // on any codeColumn-aliased catalog (labor_rates -> rate_code, maintenance_part_locations
            // -> location_code) because that physical column doesn't exist. Live-reproduced on
            // maintenance_part_locations before this fix (POST /api/v1/catalogs/maintenance/part-locations,
            // code 42703, "column \"code\" does not exist").
            const codeDbColumn = dbColumnForApiColumn("code", config);
            const conflictSql = entityScoped
              ? `SELECT id FROM catalogs.${config.tableName} WHERE ${codeDbColumn} = $1 AND operating_company_id = $2::uuid LIMIT 1`
              : `SELECT id FROM catalogs.${config.tableName} WHERE ${codeDbColumn} = $1 LIMIT 1`;
            const conflictVals = entityScoped ? [body.code, operatingCompanyId] : [body.code];
            const conflict = await client.query(conflictSql, conflictVals);
            if (conflict.rows.length > 0) return { error: `catalog_${config.tableName}_code_conflict` as const };
          }

          const insertColumns: string[] = [];
          const insertValues: unknown[] = [];
          const placeholders: string[] = [];
          let paramIndex = 1;
          if (hasAuditUserColumns) {
            insertColumns.push("created_by_user_id", "updated_by_user_id");
            insertValues.push(authUser.uuid, authUser.uuid);
            placeholders.push(`$${paramIndex++}`, `$${paramIndex++}`);
          }
          if (entityScoped) {
            insertColumns.push("operating_company_id");
            insertValues.push(operatingCompanyId);
            placeholders.push(`$${paramIndex}`);
            paramIndex += 1;
          }
          for (const column of config.allowedColumns) {
            if (!(column in body)) continue;
            insertColumns.push(dbColumnForApiColumn(column, config));
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
            ...(operatingCompanyId ? { operating_company_id: operatingCompanyId } : {}),
          });
          return { row };
        };

        const created = entityScoped
          ? await withCompanyScope(authUser.uuid, operatingCompanyId as string, runCreate)
          : await withCurrentUser(authUser.uuid, runCreate);

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
        // CLS-CATALOG-MUTATION-RLS-SILENT-404: this must mirror POST's entityScoped branching —
        // see the withCompanyScope call below for why.
        const parsedQuery = (entityScoped ? companyScopedCompanyQuerySchema : companyQuerySchema).safeParse(
          req.query ?? {}
        );
        if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
        const parsedBody = updateBodySchema.safeParse(req.body ?? {});
        if (!parsedBody.success) return validationError(reply, parsedBody.error);
        const body = parsedBody.data;
        const operatingCompanyId = parsedQuery.data.operating_company_id as string | undefined;

        const runUpdate = async (client: any) => {
          if ("code" in body && body.code) {
            // CLS-CATALOG-CODE-CONFLICT-COLUMN: same fix as the create-path conflict check above —
            // route through dbColumnForApiColumn instead of a bare `code` literal.
            const codeDbColumn = dbColumnForApiColumn("code", config);
            const conflictSql = entityScoped
              ? `SELECT id FROM catalogs.${config.tableName} WHERE ${codeDbColumn} = $1 AND id <> $2 AND operating_company_id = $3::uuid LIMIT 1`
              : `SELECT id FROM catalogs.${config.tableName} WHERE ${codeDbColumn} = $1 AND id <> $2 LIMIT 1`;
            const conflictVals = entityScoped
              ? [body.code, parsedParams.data.id, operatingCompanyId]
              : [body.code, parsedParams.data.id];
            const conflict = await client.query(conflictSql, conflictVals);
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
            add(dbColumnForApiColumn(column, config), body[column as keyof typeof body]);
          }
          // CLS-SCHEMA-DRIFT / LV-CAT-500: keep `config.hasDeactivatedAt` on the SAME if-line as
          // the `add("deactivated_at", …)` call so verify-catalog-config-physical-columns GATE_WINDOW
          // still sees the gate (multi-line if bodies pushed the flag outside the 3-line lookback).
          if (config.hasDeactivatedAt && config.softDeleteColumn && config.softDeleteColumn in body && body[config.softDeleteColumn as keyof typeof body] === false) {
            add("deactivated_at", new Date().toISOString());
          }
          if (config.hasDeactivatedAt && config.softDeleteColumn && config.softDeleteColumn in body && body[config.softDeleteColumn as keyof typeof body] === true) {
            add("deactivated_at", null);
          }
          if (hasUpdatedAt) {
            add("updated_at", new Date().toISOString());
          }
          if (hasAuditUserColumns) {
            add("updated_by_user_id", authUser.uuid);
          }
          values.push(parsedParams.data.id);
          const idPlaceholder = `$${values.length}`;
          // CLS-CATALOG-MUTATION-RLS-SILENT-404: explicit company predicate, belt-and-suspenders
          // with the RLS policy this route must now actually satisfy (see withCompanyScope below) —
          // a wrong-company id 404s on its own merits instead of only via RLS.
          let companyPredicate = "";
          if (entityScoped) {
            values.push(operatingCompanyId);
            companyPredicate = ` AND operating_company_id = $${values.length}::uuid`;
          }

          const res = await client.query(
            `
              UPDATE catalogs.${config.tableName}
              SET ${fields.join(", ")}
              WHERE id = ${idPlaceholder}${companyPredicate}
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
        };

        // CLS-CATALOG-MUTATION-RLS-SILENT-404 (live-reproduced 2026-08-22 on fuel.def_stations):
        // this route used plain withCurrentUser with a bare `WHERE id = $1` UPDATE. Every
        // entity-scoped catalogs.* table carries a FORCE RLS `company_scope` policy requiring
        // `operating_company_id = current_setting('app.operating_company_id', true)` — a session
        // that never sets that GUC has it NULL, so the RLS predicate is always false and the
        // UPDATE silently matches zero rows regardless of id, surfacing a false
        // catalog_<table>_not_found for a row that visibly exists. withCompanyScope sets the GUC
        // (and asserts real company membership) exactly like the create route above.
        const updated = entityScoped
          ? await withCompanyScope(authUser.uuid, operatingCompanyId as string, runUpdate)
          : await withCurrentUser(authUser.uuid, runUpdate);

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
        if (!config.softDeleteColumn) return reply.code(405).send({ error: "catalog_no_soft_delete" });
        if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
        const softCol = config.softDeleteColumn;
        const parsedParams = idParamSchema.safeParse(req.params ?? {});
        if (!parsedParams.success) return validationError(reply, parsedParams.error);
        // CLS-CATALOG-MUTATION-RLS-SILENT-404: mirror POST's entityScoped branching — see the
        // withCompanyScope call below for why.
        const parsedQuery = (entityScoped ? companyScopedCompanyQuerySchema : companyQuerySchema).safeParse(
          req.query ?? {}
        );
        if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
        const operatingCompanyId = parsedQuery.data.operating_company_id as string | undefined;

        const runDelete = async (client: any) => {
          // Build the SET clause from independent flags — hasUpdatedAt and hasAuditUserColumns can
          // diverge (see GenericCatalogConfig.hasAuditUserColumns), so neither is safe to bundle
          // into a single all-or-nothing ternary branch.
          const softDeleteSetParts = [`${softCol} = false`];
          if (config.hasDeactivatedAt) softDeleteSetParts.push("deactivated_at = now()");
          if (hasUpdatedAt) softDeleteSetParts.push("updated_at = now()");
          const values: unknown[] = [parsedParams.data.id];
          if (hasAuditUserColumns) {
            values.push(authUser.uuid);
            softDeleteSetParts.push(`updated_by_user_id = $${values.length}`);
          }
          // CLS-CATALOG-MUTATION-RLS-SILENT-404: explicit company predicate, belt-and-suspenders
          // with the RLS policy this route must now actually satisfy (see withCompanyScope below) —
          // a wrong-company id 404s on its own merits instead of only via RLS.
          let companyPredicate = "";
          if (entityScoped) {
            values.push(operatingCompanyId);
            companyPredicate = ` AND operating_company_id = $${values.length}::uuid`;
          }
          const res = await client.query(
            `
              UPDATE catalogs.${config.tableName}
              SET ${softDeleteSetParts.join(", ")}
              WHERE id = $1${companyPredicate}
              RETURNING id, code
            `,
            values
          );
          if (res.rows.length === 0) return null;
          await appendCrudAudit(client, authUser.uuid, `catalogs.${config.tableName}_deactivated`, {
            resource_id: res.rows[0].id,
            resource_type: `catalogs.${config.tableName}`,
            code: res.rows[0].code,
            catalog_display_name: config.displayName,
          });
          return { ok: true };
        };

        // CLS-CATALOG-MUTATION-RLS-SILENT-404 (live-reproduced 2026-08-22 on fuel.def_stations,
        // Archive button): see the identical PATCH-route note above — plain withCurrentUser never
        // sets app.operating_company_id, so the FORCE RLS company_scope policy silently zeroes
        // this UPDATE regardless of id, and Archive fails with a false not-found and, worse, ZERO
        // toast/error surfaced to the operator at all (a true silent no-op, not just a bad message).
        const result = entityScoped
          ? await withCompanyScope(authUser.uuid, operatingCompanyId as string, runDelete)
          : await withCurrentUser(authUser.uuid, runDelete);

        if (!result) return reply.code(404).send({ error: `catalog_${config.tableName}_not_found` });
        return result;
      });
    }

    app.post(`${basePath}/:id/restore`, async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return reply;
      if (config.readOnly) return reply.code(405).send({ error: "catalog_read_only" });
      if (!config.softDeleteColumn) return reply.code(405).send({ error: "catalog_no_soft_delete" });
      if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
      const softCol = config.softDeleteColumn;
      const parsedParams = idParamSchema.safeParse(req.params ?? {});
      if (!parsedParams.success) return validationError(reply, parsedParams.error);
      // CLS-CATALOG-MUTATION-RLS-SILENT-404: mirror POST's entityScoped branching — see the
      // withCompanyScope call below for why.
      const parsedQuery = (entityScoped ? companyScopedCompanyQuerySchema : companyQuerySchema).safeParse(
        req.query ?? {}
      );
      if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
      const operatingCompanyId = parsedQuery.data.operating_company_id as string | undefined;

      const runRestore = async (client: any) => {
        // Same independent-flags SET-clause build as the soft-delete route above.
        const restoreSetParts = [`${softCol} = true`];
        if (config.hasDeactivatedAt) restoreSetParts.push("deactivated_at = NULL");
        if (hasUpdatedAt) restoreSetParts.push("updated_at = now()");
        const values: unknown[] = [parsedParams.data.id];
        if (hasAuditUserColumns) {
          values.push(authUser.uuid);
          restoreSetParts.push(`updated_by_user_id = $${values.length}`);
        }
        // CLS-CATALOG-MUTATION-RLS-SILENT-404: explicit company predicate, belt-and-suspenders
        // with the RLS policy this route must now actually satisfy (see withCompanyScope below).
        let companyPredicate = "";
        if (entityScoped) {
          values.push(operatingCompanyId);
          companyPredicate = ` AND operating_company_id = $${values.length}::uuid`;
        }
        const res = await client.query(
          `
            UPDATE catalogs.${config.tableName}
            SET ${restoreSetParts.join(", ")}
            WHERE id = $1${companyPredicate}
            RETURNING ${selectColumns.join(", ").replaceAll("t.", "")}
          `,
          values
        );
        if (res.rows.length === 0) return null;
        const row = res.rows[0];
        await appendCrudAudit(client, authUser.uuid, `catalogs.${config.tableName}_restored`, {
          resource_id: row.id,
          resource_type: `catalogs.${config.tableName}`,
          catalog_display_name: config.displayName,
        });
        return row;
      };

      // CLS-CATALOG-MUTATION-RLS-SILENT-404: same root cause as PATCH/DELETE above (plain
      // withCurrentUser never sets app.operating_company_id, so FORCE RLS silently zeroes the
      // UPDATE) — restore is the exact inverse of Archive and shares its bug.
      const restored = entityScoped
        ? await withCompanyScope(authUser.uuid, operatingCompanyId as string, runRestore)
        : await withCurrentUser(authUser.uuid, runRestore);

      if (!restored) return reply.code(404).send({ error: `catalog_${config.tableName}_not_found` });
      return restored;
    });

    app.get(`${basePath}/export.csv`, async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return reply;
      const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
      if (!parsedQuery.success) return validationError(reply, parsedQuery.error);

      const rows = await withCurrentUser(authUser.uuid, async (client) => {
        const res = await client.query(
          `
            SELECT ${selectColumns.join(", ").replaceAll("t.", "")}
            FROM catalogs.${config.tableName} t
            ORDER BY t.${sortColumn} ${sortDir}, t.${codeSortColumn} ASC
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
      if (!authUser) return reply;
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
        rawRows = await parseSpreadsheetBuffer(fileBuffer, filename);
      } catch (err) {
        if (err instanceof Error && err.message === "unsupported_file_type") {
          return reply.code(400).send({ error: "unsupported_file_type" });
        }
        const code = (err as { code?: string }).code;
        if (code) {
          return reply.code(400).send({ error: code });
        }
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
