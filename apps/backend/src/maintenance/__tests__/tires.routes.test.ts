import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isLowTread,
  mapTireEventRow,
  mapTireRecordRow,
  registerMaintenanceTiresRoutes,
  tireEventTypeLabel,
} from "../tires.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const RECORD_ID = "22222222-2222-4222-8222-222222222222";
const UNIT_ID = "33333333-3333-4333-8333-333333333333";
const BRAND_ID = "44444444-4444-4444-8444-444444444444";

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
}));

// Cross-tenant guard: assertCompanyMembership() is covered by a dedicated membership test;
// no-op here so these unit tests exercise route logic with pre-change behavior.
vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
}));


function sampleRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: RECORD_ID,
    operating_company_id: COMPANY,
    unit_id: UNIT_ID,
    equipment_id: null,
    unit_number: "T-101",
    equipment_number: null,
    position_code: "STEER-LF",
    position_group: "steer",
    brand_id: BRAND_ID,
    brand_name: "Michelin X Line Energy",
    serial_number: "SN-1001",
    size: "295/75R22.5",
    tread_depth_32nds: 18,
    tread_low_threshold_32nds: 4,
    installed_at: "2026-01-15",
    status: "active",
    work_order_id: null,
    archived_at: null,
    archive_reason: null,
    created_at: "2026-06-04T08:00:00Z",
    updated_at: "2026-06-04T08:00:00Z",
    ...overrides,
  };
}

describe("maintenance tire helpers (B32)", () => {
  it("maps tire event type labels", () => {
    expect(tireEventTypeLabel("rotation")).toBe("Rotation");
    expect(tireEventTypeLabel("tread_audit")).toBe("Tread audit");
  });

  it("detects low tread against threshold", () => {
    expect(isLowTread(3.5, 4)).toBe(true);
    expect(isLowTread(8, 4)).toBe(false);
  });

  it("maps tire record row with low-tread flag", () => {
    const mapped = mapTireRecordRow(sampleRecord({ tread_depth_32nds: 3 }));
    expect(mapped.is_low_tread).toBe(true);
    expect(mapped.position_label).toBe("Steer Left Front");
  });
});

describe("maintenance tire routes (B32)", () => {
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
    await registerMaintenanceTiresRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/v1/maintenance/tires/records lists active records", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      return { rows: [sampleRecord()], rowCount: 1 };
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/maintenance/tires/records?operating_company_id=${COMPANY}&unit_id=${UNIT_ID}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      rows: [{ id: RECORD_ID, position_code: "STEER-LF", is_low_tread: false }],
    });
  });

  it("POST /api/v1/maintenance/tires/records mounts tire at axle position", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("FROM maintenance.tire_brands")) return { rows: [{ name: "Michelin X Line Energy" }] };
      if (sql.includes("INSERT INTO maintenance.tire_records")) return { rows: [{ id: RECORD_ID }] };
      return { rows: [sampleRecord()], rowCount: 1 };
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/maintenance/tires/records",
      payload: {
        operating_company_id: COMPANY,
        unit_id: UNIT_ID,
        position_code: "STEER-LF",
        brand_id: BRAND_ID,
        serial_number: "SN-1001",
        tread_depth_32nds: 18,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(mockAppendCrudAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      "maintenance.tire_record.created",
      expect.objectContaining({ position_code: "STEER-LF" })
    );
  });

  it("POST /api/v1/maintenance/tires/rotate moves tire and logs event", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("INSERT INTO maintenance.tire_events")) return { rows: [{ id: "evt-1" }] };
      if (sql.includes("UPDATE maintenance.tire_records")) return { rows: [], rowCount: 1 };
      return { rows: [sampleRecord({ position_code: "STEER-RF" })], rowCount: 1 };
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/maintenance/tires/rotate",
      payload: {
        operating_company_id: COMPANY,
        tire_record_id: RECORD_ID,
        to_position_code: "STEER-RF",
        notes: "Cross rotation",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ record: { position_code: "STEER-RF" } });
  });

  it("POST /api/v1/maintenance/tires/tread-audit flags low tread alert", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      if (sql.includes("INSERT INTO maintenance.tire_events")) return { rows: [{ id: "evt-2" }] };
      if (sql.includes("UPDATE maintenance.tire_records SET tread_depth_32nds")) return { rows: [], rowCount: 1 };
      return { rows: [sampleRecord({ tread_depth_32nds: 3 })], rowCount: 1 };
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/maintenance/tires/tread-audit",
      payload: {
        operating_company_id: COMPANY,
        tire_record_id: RECORD_ID,
        tread_depth_32nds: 3,
        notes: "Shop inspection",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ is_low_tread_alert: true });
  });

  it("GET /api/v1/maintenance/tires/alerts returns low tread records", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("set_config")) return { rows: [] };
      return { rows: [sampleRecord({ tread_depth_32nds: 3 })], rowCount: 1 };
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/maintenance/tires/alerts?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ count: 1, rows: [{ is_low_tread: true }] });
  });
});

describe("maintenance tire event mapping (B32)", () => {
  it("maps tire event row to API shape", () => {
    const mapped = mapTireEventRow({
      id: "evt-1",
      tire_record_id: RECORD_ID,
      event_type: "replacement",
      from_position_code: null,
      to_position_code: null,
      tread_depth_32nds: 32,
      brand_name: "Goodyear",
      serial_number: "SN-2002",
      notes: "Replaced steer",
      is_low_tread_alert: false,
      created_at: "2026-06-04T08:00:00Z",
    });
    expect(mapped.event_type_label).toBe("Replacement");
  });
});
