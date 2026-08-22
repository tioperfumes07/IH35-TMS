import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogRoutes } from "./factory.js";

/**
 * CC3-DEDUCTRAIL-01 regression coverage.
 *
 * ROOT CAUSE: catalogs.driver_deduction_types.default_recovery_rail is `NOT NULL DEFAULT 'ask'`
 * (migration 202609310000). It is a declared `optionalEnum` on this factory (zod `.optional()`, no
 * `.default()`). The old CREATE handler unconditionally inserted every "available" (DB-existing)
 * optional column, falling back to `?? null` for one the operator did not choose -- an EXPLICIT null
 * in a positional INSERT overrides the column's own SQL DEFAULT, so every real Create attempt hit a
 * live 500 (23502 not-null violation) instead of falling through to the owner-authored 'ask' default.
 * Live-reproduced via the real UI 2026-08-22 before this fix landed.
 */

const insertedSql: string[] = [];
const insertedParams: unknown[][] = [];

const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
  if (sql.includes("information_schema.columns")) {
    // All three declared optional columns exist on the live table.
    return {
      rows: [
        { column_name: "may_draw_escrow" },
        { column_name: "default_recovery_rail" },
        { column_name: "survives_separation" },
      ],
    };
  }
  if (sql.includes("SELECT id") && sql.includes("WHERE operating_company_id") && sql.includes("code =")) {
    return { rows: [] }; // no code conflict
  }
  if (sql.trim().startsWith("INSERT INTO catalogs.driver_deduction_types")) {
    insertedSql.push(sql);
    insertedParams.push(values ?? []);
    return {
      rows: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          operating_company_id: values?.[0],
          code: values?.[1],
          display_name: values?.[2],
          description: values?.[3],
          metadata: {},
          is_active: values?.[5],
          sort_order: values?.[6],
          may_draw_escrow: false,
          default_recovery_rail: "ask",
          survives_separation: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };
  }
  return { rows: [] };
});

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
}));

vi.mock("./deprecation.js", () => ({
  applyDriverCatalogDeprecation: vi.fn(),
}));

const TEST_OPCO = "11111111-1111-4111-8111-111111111111";

describe.sequential("driver catalog factory -- optional enum insert", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    queryMock.mockClear();
    insertedSql.length = 0;
    insertedParams.length = 0;
  });

  async function buildApp() {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = {
        uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        role: "Owner",
      };
    });
    createCatalogRoutes(app, {
      tableName: "driver_deduction_types",
      urlSegment: "deduction-types",
      routePrefix: "/api/v1/catalogs/driver",
      displayName: "Driver Deduction Types",
      codeRegex: /^[A-Z][A-Z0-9-]+$/,
      optionalBooleans: ["may_draw_escrow", "survives_separation"],
      optionalEnums: [{ column: "default_recovery_rail", values: ["escrow", "settlement", "split", "ask"] }],
    });
    return app;
  }

  it("omits an unset optional enum column from the INSERT so the SQL DEFAULT applies", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/catalogs/driver/deduction-types?operating_company_id=${TEST_OPCO}`,
      payload: { code: "CC3-TEST", display_name: "CC3 Test Deduction" },
    });
    expect(response.statusCode).toBe(201);
    expect(insertedSql).toHaveLength(1);
    // Only the INSERT's own column list matters here -- RETURNING legitimately still names
    // default_recovery_rail (it reads back whatever value the row actually has, DEFAULT included).
    const insertColumnList = insertedSql[0].split("VALUES")[0];
    // The declared booleans (always zod-defaulted, never undefined) are still inserted.
    expect(insertColumnList).toContain("may_draw_escrow");
    expect(insertColumnList).toContain("survives_separation");
    // The unset enum column must be OMITTED from the INSERT's column list -- this is the fix. An
    // explicit NULL there would override the column's own SQL DEFAULT 'ask'.
    expect(insertColumnList).not.toContain("default_recovery_rail");
    // Exactly 2 optional values appended (the two booleans), not 3.
    expect(insertedParams[0]).toHaveLength(9);
  });

  it("includes the optional enum column in the INSERT when the operator provides a value", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/catalogs/driver/deduction-types?operating_company_id=${TEST_OPCO}`,
      payload: { code: "CC3-TEST-2", display_name: "CC3 Test Deduction 2", default_recovery_rail: "settlement" },
    });
    expect(response.statusCode).toBe(201);
    expect(insertedSql).toHaveLength(1);
    expect(insertedSql[0]).toContain("default_recovery_rail");
    expect(insertedParams[0]).toContain("settlement");
  });

  it("rejects an out-of-vocabulary enum value at the API boundary (never a raw DB 500)", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/catalogs/driver/deduction-types?operating_company_id=${TEST_OPCO}`,
      payload: { code: "CC3-TEST-3", display_name: "CC3 Test Deduction 3", default_recovery_rail: "not_a_real_rail" },
    });
    expect(response.statusCode).toBe(400);
    expect(insertedSql).toHaveLength(0);
  });
});
