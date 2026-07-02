import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerMaintenanceDefectsRoutes } from "../defects.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const DEFECT_ID = "22222222-2222-4222-8222-222222222222";

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


function mockDbQuery() {
  return vi.fn(async (sql: string) => {
    if (sql.includes("SET LOCAL app.operating_company_id")) {
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  });
}

describe("maintenance dvir defects routes (B27)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(mockDbQuery());
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
    await registerMaintenanceDefectsRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/v1/maintenance/dvir-defects lists inbox rows", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      return {
        rows: [
          {
            id: DEFECT_ID,
            item_key: "brakes",
            severity: "major",
            follow_up_wo_id: null,
            latest_triage_event: null,
          },
        ],
        rowCount: 1,
      };
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/maintenance/dvir-defects?operating_company_id=${COMPANY}&status=all`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      defects: [{ id: DEFECT_ID, triage_status: "pending" }],
    });
  });

  it("GET /api/v1/maintenance/dvir-defects/:id returns defect detail", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM audit.audit_events")) {
        return { rows: [{ event_class: "maintenance.dvir_defect.assigned" }], rowCount: 1 };
      }
      return { rows: [{ id: DEFECT_ID, item_key: "tires", follow_up_wo_id: null }], rowCount: 1 };
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/maintenance/dvir-defects/${DEFECT_ID}?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("defect");
    expect(res.json()).toHaveProperty("triage_history");
  });

  it("GET /api/v1/maintenance/dvir-defects/:id returns 404 when missing", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/maintenance/dvir-defects/${DEFECT_ID}?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST triage assign records audit event", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      return {
        rows: [
          {
            id: DEFECT_ID,
            dvir_submission_id: "33333333-3333-4333-8333-333333333333",
            unit_id: "44444444-4444-4444-8444-444444444444",
            item_key: "lights",
            severity: "minor",
            notes: "dim",
            follow_up_wo_id: null,
            driver_id: null,
          },
        ],
        rowCount: 1,
      };
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/maintenance/dvir-defects/${DEFECT_ID}/triage`,
      payload: {
        operating_company_id: COMPANY,
        action: "assign",
        assignee_note: "Shop A",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ triage_status: "assigned" });
    expect(mockAppendCrudAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      "maintenance.dvir_defect.assigned",
      expect.objectContaining({ resource_id: DEFECT_ID })
    );
  });

  it("POST triage convert_to_wo creates work order", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("next_wo_display_id")) {
        return { rows: [{ display_id: "DV-100", sequence: 100 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO maintenance.work_orders")) {
        return { rows: [{ id: "55555555-5555-4555-8555-555555555555", display_id: "DV-100" }], rowCount: 1 };
      }
      if (sql.includes("UPDATE safety.dvir_submissions")) {
        return { rows: [], rowCount: 1 };
      }
      return {
        rows: [
          {
            id: DEFECT_ID,
            dvir_submission_id: "33333333-3333-4333-8333-333333333333",
            unit_id: "44444444-4444-4444-8444-444444444444",
            item_key: "steering",
            severity: "major",
            notes: "play",
            follow_up_wo_id: null,
            driver_id: null,
          },
        ],
        rowCount: 1,
      };
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/maintenance/dvir-defects/${DEFECT_ID}/triage`,
      payload: {
        operating_company_id: COMPANY,
        action: "convert_to_wo",
        wo_type: "repair",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      triage_status: "converted",
      work_order_id: "55555555-5555-4555-8555-555555555555",
    });
    expect(mockAppendCrudAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      "maintenance.dvir_defect.converted_to_wo",
      expect.objectContaining({ work_order_id: "55555555-5555-4555-8555-555555555555" })
    );
  });
});
