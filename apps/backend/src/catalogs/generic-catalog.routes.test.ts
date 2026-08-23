import Fastify from "fastify";
import multipart from "@fastify/multipart";
import ExcelJS from "exceljs";
import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mapSpreadsheetRows, normalizeHeaderKey, parseSpreadsheetBuffer } from "./excel-uploader.js";
import { createCatalogRoutes, type GenericCatalogConfig } from "./generic-catalog.factory.js";
import {
  cashAdvanceTypesCatalogConfig,
  fleetEquipmentTypesCatalogConfig,
  laborRatesCatalogConfig,
  maintenancePartLocationsCatalogConfig,
} from "./generic-catalog.routes.js";

const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
  if (sql.includes("INSERT INTO catalogs.excel_upload_jobs")) {
    return {
      rows: [
        {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          catalog_name: "fleet.equipment_types",
          file_url: "sample.xlsx",
          started_at: new Date().toISOString(),
          completed_at: null,
          rows_total: null,
          rows_succeeded: null,
          rows_failed: null,
          error_log: [],
          status: "pending",
        },
      ],
    };
  }

  if (sql.includes("UPDATE catalogs.excel_upload_jobs") && sql.includes("status = 'processing'")) {
    return { rows: [] };
  }

  if (sql.includes("INSERT INTO catalogs.equipment_types")) {
    return { rows: [] };
  }

  if (sql.includes("UPDATE catalogs.excel_upload_jobs") && sql.includes("RETURNING")) {
    return {
      rows: [
        {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          catalog_name: "fleet.equipment_types",
          file_url: "sample.xlsx",
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          rows_total: 1,
          rows_succeeded: 1,
          rows_failed: 0,
          error_log: [],
          status: "completed",
        },
      ],
    };
  }

  if (sql.includes("count(*)::text AS total")) {
    return { rows: [{ total: "1" }] };
  }

  if (sql.includes("count(*)::text AS total")) {
    return { rows: [{ total: "1" }] };
  }

  if (sql.includes("FROM catalogs.equipment_types")) {
    return {
      rows: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          code: "TEST_TYPE",
          display_name: "Test Type",
          description: null,
          is_active: true,
          sort_order: 100,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };
  }

  if (sql.includes("SELECT id FROM catalogs.equipment_types WHERE code")) {
    return { rows: [] };
  }

  if (sql.includes("UPDATE catalogs.equipment_types") && sql.includes("is_active = false")) {
    return { rows: [{ id: values?.[0], code: "TEST_TYPE" }] };
  }

  if (sql.includes("UPDATE catalogs.equipment_types") && sql.includes("is_active = true")) {
    return {
      rows: [
        {
          id: values?.[0],
          code: "TEST_TYPE",
          display_name: "Test Type",
          description: null,
          is_active: true,
          sort_order: 100,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };
  }

  if (sql.includes("INSERT INTO catalogs.equipment_types") && sql.includes("RETURNING")) {
    return {
      rows: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          code: "NEW_TYPE",
          display_name: "New Type",
          description: null,
          is_active: true,
          sort_order: 100,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };
  }

  if (sql.includes("FROM catalogs.excel_upload_jobs")) {
    return {
      rows: [
        {
          id: values?.[0],
          catalog_name: "fleet.equipment_types",
          file_url: "sample.xlsx",
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          rows_total: 1,
          rows_succeeded: 1,
          rows_failed: 0,
          error_log: [],
          status: "completed",
        },
      ],
    };
  }

  return { rows: [] };
});

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

vi.mock("../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));

vi.mock("../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
}));

const TEST_OPCO = "11111111-1111-4111-8111-111111111111";

describe.sequential("generic catalog framework", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    queryMock.mockClear();
  });

  async function buildApp() {
    const app = Fastify();
    await app.register(multipart);
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = {
        uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        role: "Owner",
      };
    });
    createCatalogRoutes(app, fleetEquipmentTypesCatalogConfig, { mode: "all" });
    app.get("/api/v1/catalogs/excel-upload-jobs/:id", async (req, reply) => {
      const jobId = (req.params as { id: string }).id;
      const job = await queryMock("SELECT FROM catalogs.excel_upload_jobs", [jobId]);
      return job.rows[0] ?? reply.code(404).send({ error: "excel_upload_job_not_found" });
    });
    return app;
  }

  it("normalizes spreadsheet headers", () => {
    expect(normalizeHeaderKey("Display Name")).toBe("display_name");
    expect(normalizeHeaderKey(" sort-order ")).toBe("sort_order");
  });

  it("flags missing required columns during import mapping", () => {
    const mapped = mapSpreadsheetRows([{ code: "X" }], {
      catalogName: "fleet.equipment_types",
      tableName: "equipment_types",
      allowedColumns: ["code", "display_name"],
      requiredColumns: ["code", "display_name"],
      validators: {
        code: z.string(),
        display_name: z.string(),
      },
    });
    expect(mapped.missingRequiredColumns).toContain("display_name");
  });

  it("GET list returns catalog rows", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/catalogs/fleet/equipment-types?operating_company_id=${TEST_OPCO}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total: 1 });
  });

  it("POST create validates required fields", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/catalogs/fleet/equipment-types?operating_company_id=${TEST_OPCO}`,
      payload: { code: "bad code" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "validation_error" });
  });

  it("DELETE archives a catalog row", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/catalogs/fleet/equipment-types/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?operating_company_id=${TEST_OPCO}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true });
  });

  it("POST restore reactivates a catalog row", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/catalogs/fleet/equipment-types/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/restore?operating_company_id=${TEST_OPCO}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ code: "TEST_TYPE", is_active: true });
  });

  it("GET export.csv returns CSV payload", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/catalogs/fleet/equipment-types/export.csv",
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.body).toContain("code,display_name");
  });

  it("POST import accepts xlsx and returns job id", async () => {
    const app = await buildApp();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.addRows([
      ["code", "display_name"],
      ["IMPORT_ONE", "Import One"],
    ]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const boundary = "----catalog-import-boundary";
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sample.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
      ),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/catalogs/fleet/equipment-types/import",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ job_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", status: "completed" });
  });

  it("parseSpreadsheetBuffer reads csv files", async () => {
    const csv = 'code,display_name\nA1,"Alpha, Inc."\n';
    const rows = await parseSpreadsheetBuffer(Buffer.from(csv, "utf8"), "sample.csv");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code: "A1", display_name: "Alpha, Inc." });
  });

  it("parseSpreadsheetBuffer rejects parsed legacy xls files", async () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await expect(parseSpreadsheetBuffer(ole, "legacy.xls")).rejects.toThrow("unsupported_file_type");
  });
});

// LST-CATALOG-AUDIT-COLUMNS-500 — catalogs.cash_advance_types (and 19 sibling catalogs) has a real
// `updated_at` column but NO created_by_user_id/updated_by_user_id columns at all. The factory used
// to write those columns unconditionally whenever hasUpdatedAt was true, which 500'd every
// Create/Edit/Void/Restore on those catalogs with a raw Postgres 42703
// ("column ... does not exist") surfaced straight to the operator. Live-reproduced 2026-08-22 on
// the real Cash Advance Types edit form before this fix. Asserts the generated SQL for the fixed
// catalog never references the audit-user columns, and — as a control — that the DEFAULT catalog
// (hasAuditUserColumns unset) still does, so a regression that re-couples the two flags is caught
// either way.
describe.sequential("generic catalog framework — hasAuditUserColumns", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];
  // queryMock is the SAME shared mock the first describe block above uses (module-level, wired
  // through the "../auth/db.js" mock). Restore its original big-switch implementation after every
  // test here so this block can never leak state into the first block regardless of run order.
  const originalQueryImpl = queryMock.getMockImplementation();

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    if (originalQueryImpl) queryMock.mockImplementation(originalQueryImpl);
  });

  async function buildAppFor(config: GenericCatalogConfig, sqlLog: string[]) {
    const mockQuery = vi.fn(async (sql: string) => {
      sqlLog.push(sql);
      if (sql.includes("SELECT id FROM catalogs.")) return { rows: [] }; // no code conflict
      if (sql.trim().startsWith("INSERT INTO")) {
        return { rows: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", code: "TEST", display_name: "Test", is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }] };
      }
      if (sql.trim().startsWith("UPDATE")) {
        return { rows: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", code: "TEST", display_name: "Test", is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }] };
      }
      return { rows: [] };
    });
    const app = Fastify();
    await app.register(multipart);
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = {
        uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        role: "Owner",
      };
    });
    // withCurrentUser's client (mocked at module level) always calls the shared queryMock, so
    // route this test's queries through it by swapping its implementation for the duration —
    // restored in afterEach above, regardless of which test runs.
    queryMock.mockImplementation(mockQuery as typeof queryMock);
    createCatalogRoutes(app, config, { mode: "all" });
    return app;
  }

  it("fixed catalog (hasAuditUserColumns: false): CREATE never references the audit-user columns", async () => {
    const sqlLog: string[] = [];
    const app = await buildAppFor(cashAdvanceTypesCatalogConfig, sqlLog);
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/catalogs/driver/cash-advance-types?operating_company_id=${TEST_OPCO}`,
      payload: { code: "ROUTE2", display_name: "Route advance 2" },
    });
    expect(response.statusCode).toBe(201);
    const insertSql = sqlLog.find((s) => s.trim().startsWith("INSERT INTO"));
    expect(insertSql).toBeDefined();
    expect(insertSql).not.toContain("created_by_user_id");
    expect(insertSql).not.toContain("updated_by_user_id");
  });

  it("fixed catalog (hasAuditUserColumns: false): UPDATE never references updated_by_user_id, but keeps updated_at", async () => {
    const sqlLog: string[] = [];
    const app = await buildAppFor(cashAdvanceTypesCatalogConfig, sqlLog);
    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/catalogs/driver/cash-advance-types/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?operating_company_id=${TEST_OPCO}`,
      payload: { description: "updated" },
    });
    expect(response.statusCode).toBe(200);
    const updateSql = sqlLog.find((s) => s.trim().startsWith("UPDATE"));
    expect(updateSql).toBeDefined();
    expect(updateSql).not.toContain("updated_by_user_id");
    expect(updateSql).toContain("updated_at");
  });

  it("fixed catalog (hasAuditUserColumns: false): DELETE (soft-archive) never references updated_by_user_id", async () => {
    const sqlLog: string[] = [];
    const app = await buildAppFor(cashAdvanceTypesCatalogConfig, sqlLog);
    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/catalogs/driver/cash-advance-types/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?operating_company_id=${TEST_OPCO}`,
    });
    expect(response.statusCode).toBe(200);
    const deleteSql = sqlLog.find((s) => s.trim().startsWith("UPDATE") && s.includes("is_active = false"));
    expect(deleteSql).toBeDefined();
    expect(deleteSql).not.toContain("updated_by_user_id");
  });

  it("fixed catalog (hasAuditUserColumns: false): RESTORE never references updated_by_user_id", async () => {
    const sqlLog: string[] = [];
    const app = await buildAppFor(cashAdvanceTypesCatalogConfig, sqlLog);
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/catalogs/driver/cash-advance-types/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/restore?operating_company_id=${TEST_OPCO}`,
    });
    expect(response.statusCode).toBe(200);
    const restoreSql = sqlLog.find((s) => s.trim().startsWith("UPDATE") && s.includes("is_active = true"));
    expect(restoreSql).toBeDefined();
    expect(restoreSql).not.toContain("updated_by_user_id");
  });

  it("REGRESSION CONTROL — default catalog (hasAuditUserColumns unset) still writes the audit-user columns", async () => {
    const sqlLog: string[] = [];
    const app = await buildAppFor(fleetEquipmentTypesCatalogConfig, sqlLog);
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/catalogs/fleet/equipment-types?operating_company_id=${TEST_OPCO}`,
      payload: { code: "CTRL", display_name: "Control" },
    });
    expect(response.statusCode).toBe(201);
    const insertSql = sqlLog.find((s) => s.trim().startsWith("INSERT INTO"));
    expect(insertSql).toBeDefined();
    expect(insertSql).toContain("created_by_user_id");
    expect(insertSql).toContain("updated_by_user_id");
  });

  // CC3-CATALOG-AUDIT-COLUMNS-500-LABORRATES / -PARTLOCATIONS — labor_rates and
  // maintenance_part_locations have NEITHER updated_at NOR created_by_user_id/updated_by_user_id at
  // all (confirmed live via information_schema), yet both flags defaulted true (neither catalog had
  // ever been given hasUpdatedAt/hasAuditUserColumns). Live-reproduced 2026-08-22: a real Create
  // attempt on each hard-500'd with a raw Postgres 42703 ("column \"created_by_user_id\" of relation
  // ... does not exist") surfaced straight to the operator. Entity-scoped catalogs (routed through
  // withCompanyScope, not withCurrentUser directly) — buildAppFor's shared mocks already cover both.

  it("labor_rates (hasUpdatedAt+hasAuditUserColumns: false): CREATE never references updated_at or the audit-user columns", async () => {
    const sqlLog: string[] = [];
    const app = await buildAppFor(laborRatesCatalogConfig, sqlLog);
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/catalogs/maintenance/labor-rates?operating_company_id=${TEST_OPCO}`,
      payload: { code: "CC3-TEST-RATE", display_name: "125.50" },
    });
    expect(response.statusCode).toBe(201);
    const insertSql = sqlLog.find((s) => s.trim().startsWith("INSERT INTO"));
    expect(insertSql).toBeDefined();
    expect(insertSql).not.toContain("created_by_user_id");
    expect(insertSql).not.toContain("updated_by_user_id");
    // The RETURNING clause legitimately still names updated_at (NULL::timestamptz AS updated_at,
    // hasUpdatedAt:false's honest read-back placeholder) -- only the INSERT column list matters here.
    const insertColumnList = insertSql?.split("VALUES")[0] ?? "";
    expect(insertColumnList).not.toContain("updated_at");
  });

  it("maintenance_part_locations (hasUpdatedAt+hasAuditUserColumns: false): CREATE never references updated_at or the audit-user columns", async () => {
    const sqlLog: string[] = [];
    const app = await buildAppFor(maintenancePartLocationsCatalogConfig, sqlLog);
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/catalogs/maintenance/part-locations?operating_company_id=${TEST_OPCO}`,
      payload: { code: "CC3-TEST-LOC", display_name: "Test Location" },
    });
    expect(response.statusCode).toBe(201);
    const insertSql = sqlLog.find((s) => s.trim().startsWith("INSERT INTO"));
    expect(insertSql).toBeDefined();
    expect(insertSql).not.toContain("created_by_user_id");
    expect(insertSql).not.toContain("updated_by_user_id");
    // The RETURNING clause legitimately still names updated_at (NULL::timestamptz AS updated_at,
    // hasUpdatedAt:false's honest read-back placeholder) -- only the INSERT column list matters here.
    const insertColumnList = insertSql?.split("VALUES")[0] ?? "";
    expect(insertColumnList).not.toContain("updated_at");
  });
});

// CLS-CATALOG-MUTATION-RLS-SILENT-404 — PATCH/DELETE/restore on every entity-scoped generic
// catalog used plain withCurrentUser with a bare `WHERE id = $1` UPDATE. catalogs.* tables carry
// a FORCE RLS `company_scope` policy requiring `operating_company_id =
// current_setting('app.operating_company_id', true)`; only withCompanyScope (used by CREATE)
// sets that GUC. A session that never sets it has the setting NULL, so the RLS predicate is
// always false and the UPDATE silently matches zero rows regardless of id -- a real row reads
// back as a false catalog_<table>_not_found. Live-reproduced 2026-08-22 on fuel.def_stations:
// Edit surfaced "Failed to save catalog row: catalog_def_stations_not_found" in the form, and
// Archive failed the exact same way with ZERO toast/error at all (a true silent no-op) -- for a
// row visibly present in the table one paint earlier. These assertions catch a regression back to
// plain withCurrentUser by checking for the one thing only withCompanyScope's real implementation
// (apps/backend/src/catalogs/fleet/shared.ts) does: issue `set_config('app.operating_company_id',
// ...)` before the mutation, and by checking the UPDATE's own WHERE clause carries the belt-and-
// suspenders operating_company_id predicate.
describe.sequential("generic catalog framework — entity-scoped mutations set company scope (CLS-CATALOG-MUTATION-RLS-SILENT-404)", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];
  const originalQueryImpl = queryMock.getMockImplementation();

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    if (originalQueryImpl) queryMock.mockImplementation(originalQueryImpl);
  });

  async function buildScopedApp(sqlLog: string[]) {
    const mockQuery = vi.fn(async (sql: string) => {
      sqlLog.push(sql);
      if (sql.includes("set_config")) return { rows: [{ set_config: "" }] };
      if (sql.includes("SELECT id FROM catalogs.")) return { rows: [] }; // no code conflict
      if (sql.trim().startsWith("UPDATE")) {
        return {
          rows: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", code: "CTRL", display_name: "Control", is_active: true }],
        };
      }
      return { rows: [] };
    });
    const app = Fastify();
    await app.register(multipart);
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = { uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", role: "Owner" };
    });
    queryMock.mockImplementation(mockQuery as typeof queryMock);
    createCatalogRoutes(app, fleetEquipmentTypesCatalogConfig, { mode: "all" });
    return app;
  }

  it("PATCH sets app.operating_company_id before the UPDATE and scopes the WHERE clause", async () => {
    const sqlLog: string[] = [];
    const app = await buildScopedApp(sqlLog);
    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/catalogs/fleet/equipment-types/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?operating_company_id=${TEST_OPCO}`,
      payload: { description: "updated" },
    });
    expect(response.statusCode).toBe(200);
    expect(sqlLog.some((s) => s.includes("set_config") && s.includes("app.operating_company_id"))).toBe(true);
    const updateSql = sqlLog.find((s) => s.trim().startsWith("UPDATE"));
    expect(updateSql).toContain("operating_company_id = $");
  });

  it("DELETE (Archive) sets app.operating_company_id before the UPDATE and scopes the WHERE clause", async () => {
    const sqlLog: string[] = [];
    const app = await buildScopedApp(sqlLog);
    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/catalogs/fleet/equipment-types/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?operating_company_id=${TEST_OPCO}`,
    });
    expect(response.statusCode).toBe(200);
    expect(sqlLog.some((s) => s.includes("set_config") && s.includes("app.operating_company_id"))).toBe(true);
    const deleteSql = sqlLog.find((s) => s.trim().startsWith("UPDATE") && s.includes("is_active = false"));
    expect(deleteSql).toContain("operating_company_id = $");
  });

  it("POST restore sets app.operating_company_id before the UPDATE and scopes the WHERE clause", async () => {
    const sqlLog: string[] = [];
    const app = await buildScopedApp(sqlLog);
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/catalogs/fleet/equipment-types/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/restore?operating_company_id=${TEST_OPCO}`,
    });
    expect(response.statusCode).toBe(200);
    expect(sqlLog.some((s) => s.includes("set_config") && s.includes("app.operating_company_id"))).toBe(true);
    const restoreSql = sqlLog.find((s) => s.trim().startsWith("UPDATE") && s.includes("is_active = true"));
    expect(restoreSql).toContain("operating_company_id = $");
  });

  it("PATCH without operating_company_id 400s instead of silently matching zero rows under RLS", async () => {
    const sqlLog: string[] = [];
    const app = await buildScopedApp(sqlLog);
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/catalogs/fleet/equipment-types/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      payload: { description: "updated" },
    });
    expect(response.statusCode).toBe(400);
  });
});
