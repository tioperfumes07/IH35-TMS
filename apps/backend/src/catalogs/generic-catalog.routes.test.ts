import Fastify from "fastify";
import multipart from "@fastify/multipart";
import * as XLSX from "xlsx";
import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mapSpreadsheetRows, normalizeHeaderKey, parseSpreadsheetBuffer } from "./excel-uploader.js";
import { createCatalogRoutes } from "./generic-catalog.factory.js";
import { fleetEquipmentTypesCatalogConfig } from "./generic-catalog.routes.js";

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

  if (sql.includes("UPDATE catalogs.equipment_types") && sql.includes("deactivated_at = now()")) {
    return { rows: [{ id: values?.[0], code: "TEST_TYPE" }] };
  }

  if (sql.includes("UPDATE catalogs.equipment_types") && sql.includes("deactivated_at = NULL")) {
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

vi.mock("../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
}));

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
      url: "/api/v1/catalogs/fleet/equipment-types",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total: 1 });
  });

  it("POST create validates required fields", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/catalogs/fleet/equipment-types",
      payload: { code: "bad code" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "validation_error" });
  });

  it("DELETE archives a catalog row", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "DELETE",
      url: "/api/v1/catalogs/fleet/equipment-types/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true });
  });

  it("POST restore reactivates a catalog row", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/catalogs/fleet/equipment-types/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/restore",
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
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["code", "display_name"],
      ["IMPORT_ONE", "Import One"],
    ]);
    XLSX.utils.book_append_sheet(wb, sheet, "Sheet1");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

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

  it("parseSpreadsheetBuffer reads csv files", () => {
    const csv = "code,display_name\nA1,Alpha\n";
    const rows = parseSpreadsheetBuffer(Buffer.from(csv, "utf8"), "sample.csv");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code: "A1", display_name: "Alpha" });
  });
});
