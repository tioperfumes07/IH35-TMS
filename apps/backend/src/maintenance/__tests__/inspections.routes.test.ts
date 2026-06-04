import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  inspectionTypeLabel,
  mapInspectionRow,
  registerMaintenanceInspectionsRoutes,
} from "../inspections.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const INSPECTION_ID = "22222222-2222-4222-8222-222222222222";
const UNIT_ID = "33333333-3333-4333-8333-333333333333";
const DVIR_ID = "44444444-4444-4444-8444-444444444444";
const DOCS_FILE_ID = "55555555-5555-4555-8555-555555555555";

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
  buildPatchChanges: () => ({ status: "completed" }),
}));

function sampleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INSPECTION_ID,
    operating_company_id: COMPANY,
    unit_id: UNIT_ID,
    unit_number: "T-101",
    inspection_type: "pre_trip",
    status: "completed",
    scheduled_date: null,
    inspection_date: "2026-06-04",
    inspector_name: "Alex Mechanic",
    mileage: 120000,
    outcome: "pass",
    notes: "",
    defects: [],
    dvir_submission_id: DVIR_ID,
    dvir_type: "pre_trip",
    dvir_submitted_at: "2026-06-04T08:00:00Z",
    is_ad_hoc: false,
    archived_at: null,
    archive_reason: null,
    created_at: "2026-06-04T08:00:00Z",
    updated_at: "2026-06-04T08:00:00Z",
    photo_count: 1,
    ...overrides,
  };
}

describe("maintenance inspection helpers (B30)", () => {
  it("maps inspection type labels", () => {
    expect(inspectionTypeLabel("annual_dot")).toBe("Annual DOT");
    expect(inspectionTypeLabel("pre_trip")).toBe("Pre-trip");
  });

  it("maps inspection row to API shape", () => {
    const mapped = mapInspectionRow(sampleRow());
    expect(mapped.inspection_type_label).toBe("Pre-trip");
    expect(mapped.dvir_submission_id).toBe(DVIR_ID);
  });
});

describe("maintenance inspection routes (B30)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockAppendCrudAudit.mockReset();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Manager",
        email: "maint@ih35.local",
      };
    });
    await registerMaintenanceInspectionsRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/v1/maintenance/inspections lists rows", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      return { rows: [sampleRow()], rowCount: 1 };
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/maintenance/inspections?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      rows: [{ id: INSPECTION_ID, inspection_type_label: "Pre-trip" }],
    });
  });

  it("POST /api/v1/maintenance/inspections creates inspection with DVIR link", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM safety.dvir_submissions")) return { rows: [{ id: DVIR_ID }] };
      if (sql.includes("INSERT INTO maintenance.inspections")) return { rows: [{ id: INSPECTION_ID }] };
      return { rows: [sampleRow()], rowCount: 1 };
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/maintenance/inspections",
      payload: {
        operating_company_id: COMPANY,
        unit_id: UNIT_ID,
        inspection_type: "pre_trip",
        status: "completed",
        inspection_date: "2026-06-04",
        inspector_name: "Alex Mechanic",
        outcome: "pass",
        dvir_submission_id: DVIR_ID,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(mockAppendCrudAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      "maintenance.inspection.created",
      expect.objectContaining({ dvir_submission_id: DVIR_ID })
    );
  });

  it("PATCH /api/v1/maintenance/inspections/:id updates inspection", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("SELECT * FROM maintenance.inspections")) return { rows: [sampleRow({ status: "scheduled" })] };
      return { rows: [sampleRow({ status: "completed" })], rowCount: 1 };
    });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/maintenance/inspections/${INSPECTION_ID}`,
      payload: {
        operating_company_id: COMPANY,
        status: "completed",
        outcome: "pass",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "completed" });
  });

  it("POST /api/v1/maintenance/inspections/:id/photos attaches docs file", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM maintenance.inspections WHERE id")) return { rows: [{ id: INSPECTION_ID }] };
      if (sql.includes("FROM docs.files")) return { rows: [{ id: DOCS_FILE_ID }] };
      if (sql.includes("INSERT INTO maintenance.inspection_photos")) {
        return {
          rows: [{ id: "photo-1", docs_file_id: DOCS_FILE_ID, caption: null, sort_order: 0, created_at: "2026-06-04" }],
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/maintenance/inspections/${INSPECTION_ID}/photos`,
      payload: {
        operating_company_id: COMPANY,
        docs_file_id: DOCS_FILE_ID,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ photo: { docs_file_id: DOCS_FILE_ID } });
  });
});
