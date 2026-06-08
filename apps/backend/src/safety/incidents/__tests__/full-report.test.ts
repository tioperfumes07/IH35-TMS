import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyIncidentFullReportRoutes } from "../full-report.routes.js";

const DRIVER_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DRIVER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const LOAD_ID = "22222222-2222-4222-8222-222222222222";
const UNIT_ID = "33333333-3333-4333-8333-333333333333";
const TRAILER_ID = "44444444-4444-4444-8444-444444444444";
const INCIDENT_ID = "55555555-5555-4555-8555-555555555555";

const { mockQuery, mockWithCurrentUser, mockAppendCrudAudit, mockDispatchNotification, mockListCompanyUserIdsByRoles } = vi.hoisted(() => {
  const query = vi.fn();
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) => fn({ query }));
  const appendCrudAudit = vi.fn(async () => undefined);
  const dispatchNotification = vi.fn(async () => ({ ok: true }));
  const listCompanyUserIdsByRoles = vi.fn(async () => [
    "66666666-6666-4666-8666-666666666666",
    "77777777-7777-4777-8777-777777777777",
  ]);
  return {
    mockQuery: query,
    mockWithCurrentUser: withCurrentUser,
    mockAppendCrudAudit: appendCrudAudit,
    mockDispatchNotification: dispatchNotification,
    mockListCompanyUserIdsByRoles: listCompanyUserIdsByRoles,
  };
});

vi.mock("../../../auth/db.js", () => ({
  withCurrentUser: mockWithCurrentUser,
}));

vi.mock("../../../driver/auth.js", () => ({
  requireDriverSession: vi.fn(async (req: { driver?: unknown }) => {
    req.driver = {
      id: DRIVER_ID,
      full_name: "Driver Test",
      status: "active",
      preferred_language: "en",
    };
    return true;
  }),
}));

vi.mock("../../../audit/crud-audit.js", () => ({
  appendCrudAudit: mockAppendCrudAudit,
}));

vi.mock("../../../notifications/dispatcher.js", () => ({
  dispatchNotification: mockDispatchNotification,
  listCompanyUserIdsByRoles: mockListCompanyUserIdsByRoles,
}));

function fullReportPayload(type: "accident" | "breakdown") {
  return {
    load_id: LOAD_ID,
    stop_id: null,
    type,
    severity: "critical",
    incident_subtype: "test-subtype",
    description: "Driver reported major issue during route execution.",
    location_label: "I-35 Northbound",
    geo_lat: 29.4241,
    geo_lng: -98.4936,
    occurred_at: "2026-06-08T02:04:00.000Z",
    photo_keys: ["incident-photo-1"],
    witnesses: [{ name: "Jane Doe", phone: "555-0100", statement: "Saw the event happen." }],
    police_report: {
      has_report: true,
      report_number: "PR-1234",
      agency: "DPS",
      officer_name: "Officer Rivera",
      notes: "Filed on scene",
    },
    photo_exif: [{ exif_present: true, size_bytes: 1234 }],
  };
}

describe("safety incidents full report route (WF-048)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockWithCurrentUser.mockClear();
    mockAppendCrudAudit.mockClear();
    mockDispatchNotification.mockClear();
    mockListCompanyUserIdsByRoles.mockClear();

    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM mdata.drivers")) {
        return { rows: [{ id: DRIVER_ID, operating_company_id: COMPANY_ID }], rowCount: 1 };
      }
      if (sql.includes("FROM information_schema.columns") && sql.includes("table_name = 'loads'")) {
        return {
          rows: [{ column_name: "assigned_trailer_id" }, { column_name: "assigned_unit_id" }],
          rowCount: 2,
        };
      }
      if (sql.includes("FROM mdata.loads")) {
        return {
          rows: [
            {
              id: LOAD_ID,
              operating_company_id: COMPANY_ID,
              assigned_unit_id: UNIT_ID,
              assigned_trailer_id: TRAILER_ID,
              assigned_primary_driver_id: DRIVER_ID,
              assigned_secondary_driver_id: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("FROM information_schema.columns") && sql.includes("table_name = 'incidents'")) {
        return {
          rows: [
            { column_name: "id" },
            { column_name: "operating_company_id" },
            { column_name: "incident_type" },
            { column_name: "incident_at" },
            { column_name: "status" },
            { column_name: "description" },
            { column_name: "location" },
            { column_name: "driver_id" },
            { column_name: "unit_id" },
            { column_name: "trailer_id" },
            { column_name: "load_id" },
            { column_name: "photo_keys" },
            { column_name: "incident_subtype" },
            { column_name: "police_report_number" },
            { column_name: "witnesses" },
            { column_name: "geo" },
          ],
          rowCount: 16,
        };
      }
      if (sql.includes("INSERT INTO safety.incidents")) {
        return { rows: [{ id: INCIDENT_ID, incident_type: "damage_report" }], rowCount: 1 };
      }
      if (sql.includes("SELECT to_regclass")) {
        const rel = String(values?.[0] ?? "");
        if (rel === "maintenance.work_orders") return { rows: [{ ok: true }], rowCount: 1 };
        if (rel === "safety.accidents") return { rows: [{ ok: true }], rowCount: 1 };
        if (rel === "safety.cargo_claims") return { rows: [{ ok: true }], rowCount: 1 };
        if (rel === "safety.workers_comp_claims") return { rows: [{ ok: true }], rowCount: 1 };
        return { rows: [{ ok: false }], rowCount: 1 };
      }
      if (sql.includes("table_name = $2")) {
        const table = String(values?.[1] ?? "");
        if (table === "work_orders") {
          return {
            rows: [
              { column_name: "operating_company_id" },
              { column_name: "wo_type" },
              { column_name: "source_type" },
              { column_name: "status" },
              { column_name: "unit_id" },
              { column_name: "driver_id" },
              { column_name: "load_id" },
              { column_name: "opened_at" },
              { column_name: "repair_location" },
              { column_name: "description" },
              { column_name: "display_id" },
              { column_name: "unit_sequence" },
              { column_name: "origin" },
              { column_name: "wo_title" },
              { column_name: "bucket" },
            ],
            rowCount: 15,
          };
        }
        return {
          rows: [
            { column_name: "operating_company_id" },
            { column_name: "incident_id" },
            { column_name: "driver_id" },
            { column_name: "unit_id" },
            { column_name: "load_id" },
            { column_name: "status" },
            { column_name: "reported_at" },
            { column_name: "description" },
            { column_name: "insurance_flag" },
          ],
          rowCount: 9,
        };
      }
      if (sql.includes("FROM maintenance.next_wo_display_id")) {
        return { rows: [{ display_id: "WO-0001", sequence: 1 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO maintenance.work_orders")) {
        return { rows: [{ id: "88888888-8888-4888-8888-888888888888" }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO safety.accidents")) {
        return { rows: [{ id: "99999999-9999-4999-8999-999999999999" }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO safety.cargo_claims")) {
        return { rows: [{ id: "aaaaaaaa-0000-4000-8000-000000000001" }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO safety.workers_comp_claims")) {
        return { rows: [{ id: "bbbbbbbb-0000-4000-8000-000000000001" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.decorateRequest("driver", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: DRIVER_USER_ID,
        role: "Driver",
        email: "driver@example.com",
      };
    });
    await registerSafetyIncidentFullReportRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates accident incident and triggers accident workflow + notifications", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/safety/incidents/full-report",
      payload: fullReportPayload("accident"),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      incident: { id: INCIDENT_ID },
      normalized_incident_type: "damage_report",
      workflow: {
        accident_id: "99999999-9999-4999-8999-999999999999",
        notified_users: 2,
      },
    });
    expect(mockDispatchNotification).toHaveBeenCalledTimes(2);
  });

  it("creates breakdown incident and spawns maintenance work order", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/safety/incidents/full-report",
      payload: fullReportPayload("breakdown"),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      workflow: {
        maintenance_work_order_id: "88888888-8888-4888-8888-888888888888",
      },
    });
  });
});
