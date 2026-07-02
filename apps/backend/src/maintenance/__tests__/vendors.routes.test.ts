import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildVendorMetadata,
  mapVendorRow,
  nameToVendorCode,
  parseVendorsCsv,
  registerMaintenanceVendorsRoutes,
} from "../vendors.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";

const { mockQuery, mockWithCurrentUser, mockAppendCrudAudit } = vi.hoisted(() => {
  const query = vi.fn();
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) =>
    fn({ query })
  );
  const appendCrudAudit = vi.fn(async () => undefined);
  return { mockQuery: query, mockWithCurrentUser: withCurrentUser, mockAppendCrudAudit: appendCrudAudit };
});

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: mockWithCurrentUser,
}));

vi.mock("../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: mockAppendCrudAudit,
  buildPatchChanges: () => ({}),
}));

// Cross-tenant guard: assertCompanyMembership() is covered by a dedicated membership test;
// no-op here so these unit tests exercise route logic with pre-change behavior.
vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));


describe("maintenance vendor helpers (B29)", () => {
  it("derives vendor code from display name", () => {
    expect(nameToVendorCode("Goodyear Commercial")).toBe("GOODYEAR-COMMERCIAL");
  });

  it("parses vendor CSV rows with required display_name", () => {
    const rows = parseVendorsCsv("display_name,type\nFleet Pride,Tire\n");
    expect(rows).toHaveLength(1);
    expect(rows[0].display_name).toBe("Fleet Pride");
    expect(rows[0].code).toBe("FLEET-PRIDE");
  });

  it("maps catalog row metadata to API shape", () => {
    const mapped = mapVendorRow({
      id: "v-1",
      operating_company_id: COMPANY,
      code: "FLEETPRIDE",
      display_name: "FleetPride",
      description: "Parts vendor",
      metadata: { contact_email: "rep@fleet.com", type: "Parts" },
      is_active: true,
      sort_order: 10,
      created_at: "2026-06-04",
      updated_at: "2026-06-04",
    });
    expect(mapped.contact_email).toBe("rep@fleet.com");
    expect(mapped.type).toBe("Parts");
  });

  it("builds metadata from contact fields", () => {
    expect(
      buildVendorMetadata({
        type: "Tire",
        contact_email: "a@b.com",
        payment_terms: "Net 30",
      })
    ).toEqual({
      type: "Tire",
      contact_email: "a@b.com",
      payment_terms: "Net 30",
    });
  });
});

describe("maintenance vendor routes (B29)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM catalogs.maintenance_vendors") && sql.includes("ORDER BY")) {
        return {
          rows: [
            {
              id: "v-1",
              operating_company_id: COMPANY,
              code: "FLEETPRIDE",
              display_name: "FleetPride",
              description: null,
              metadata: { contact_email: "rep@fleet.com" },
              is_active: true,
              sort_order: 10,
              created_at: "2026-06-04",
              updated_at: "2026-06-04",
            },
          ],
        };
      }
      return { rows: [] };
    });
    app = Fastify();
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string } }).user = { uuid: "user-test-1" };
    });
    await registerMaintenanceVendorsRoutes(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it("lists vendors from catalogs.maintenance_vendors", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/maintenance/vendors?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { rows: Array<{ code: string }>; csv_import_enabled: boolean };
    expect(body.rows[0]?.code).toBe("FLEETPRIDE");
    expect(body.csv_import_enabled).toBe(true);
    expect(mockQuery.mock.calls.some(([sql]) => String(sql).includes("catalogs.maintenance_vendors"))).toBe(true);
  });
});
