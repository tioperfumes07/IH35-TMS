import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDispatchViewPayload, registerDispatchViewRoutes } from "../dispatch-view.routes.js";

const DRIVER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DRIVER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LOAD_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const STOP_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const EVIDENCE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const { mockQuery, mockWithCurrentUser, mockRequireDriverSession, mockAppendCrudAudit } = vi.hoisted(() => {
  const query = vi.fn();
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) =>
    fn({ query })
  );
  const requireDriverSession = vi.fn(async () => true);
  const appendCrudAudit = vi.fn(async () => undefined);
  return {
    mockQuery: query,
    mockWithCurrentUser: withCurrentUser,
    mockRequireDriverSession: requireDriverSession,
    mockAppendCrudAudit: appendCrudAudit,
  };
});

vi.mock("../../../auth/db.js", () => ({
  withCurrentUser: mockWithCurrentUser,
}));

vi.mock("../../../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../../../driver/auth.js", () => ({
  requireDriverSession: mockRequireDriverSession,
}));

vi.mock("../../../audit/crud-audit.js", () => ({
  appendCrudAudit: mockAppendCrudAudit,
}));

describe("dispatch-view routes (GAP-34)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockAppendCrudAudit.mockClear();
    mockRequireDriverSession.mockResolvedValue(true);
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.decorateRequest("driver", null);
    app.addHook("preHandler", async (req) => {
      req.user = { uuid: "user-a", role: "Driver", email: "driver@ih35.local" };
      req.driver = {
        id: DRIVER_A,
        full_name: "Driver A",
        status: "Active",
        preferred_language: "en",
      };
    });
    await registerDispatchViewRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("buildDispatchViewPayload maps contacts and stops", () => {
    const payload = buildDispatchViewPayload(
      {
        id: LOAD_A,
        load_number: "LD-100",
        status: "in_transit",
        customer_name: "Acme",
        special_instructions: "Call ahead",
        pickup_contact_name: "Shipper",
        pickup_contact_phone: "555-0100",
        delivery_contact_name: "Receiver",
        delivery_contact_phone: "555-0200",
      },
      [
        {
          stop_uuid: STOP_A,
          sequence: 1,
          type: "pickup",
          location_name: "Warehouse",
          address: "1 Main",
          city: "Laredo",
          state: "TX",
          lat: 27.5,
          lng: -99.5,
          scheduled_arrival_at: "2026-06-07T10:00:00Z",
          scheduled_departure_at: "2026-06-07T11:00:00Z",
          actual_arrival_at: null,
          actual_departure_at: null,
          status: "pending",
          contact_name: null,
          contact_phone: null,
          hours: null,
          dispatcher_notes: null,
          doc_requirements: ["bol"],
          geofence_status: "pending",
          docs_uploaded: false,
        },
      ]
    );
    expect(payload.load_number).toBe("LD-100");
    expect(payload.pickup_contact.name).toBe("Shipper");
    expect(payload.stops[0].doc_requirements).toContain("bol");
  });

  it("GET dispatch-view returns 403 when driver does not own load (RLS)", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM mdata.loads l")) return { rows: [] };
      return { rows: [] };
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/dispatch/driver-pwa/load/${LOAD_A}/dispatch-view`,
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET dispatch-view returns payload for owned load", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM mdata.loads l") && sql.includes("LIMIT 1")) {
        return {
          rows: [
            {
              id: LOAD_A,
              load_number: "LD-100",
              status: "in_transit",
              customer_name: "Acme",
              special_instructions: null,
              pickup_contact_name: null,
              pickup_contact_phone: null,
              delivery_contact_name: null,
              delivery_contact_phone: null,
            },
          ],
        };
      }
      if (sql.includes("FROM mdata.load_stops s")) {
        return {
          rows: [
            {
              id: STOP_A,
              sequence_number: 1,
              stop_type: "pickup",
              address_line1: "1 Main",
              city: "Laredo",
              state: "TX",
              scheduled_arrival_at: "2026-06-07T10:00:00Z",
              scheduled_departure_at: "2026-06-07T11:00:00Z",
              actual_arrival_at: null,
              actual_departure_at: null,
              status: "pending",
              notes: null,
              location_name: "Warehouse",
              latitude: 27.5,
              longitude: -99.5,
              contact_name: null,
              contact_phone: null,
              hours: null,
              docs_uploaded: false,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/dispatch/driver-pwa/load/${LOAD_A}/dispatch-view`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { load_uuid: string; stops: unknown[] };
    expect(body.load_uuid).toBe(LOAD_A);
    expect(body.stops).toHaveLength(1);
  });

  it("POST arrival rejects cross-driver stop access", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("JOIN mdata.loads l ON l.id = s.load_id")) return { rows: [] };
      return { rows: [] };
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/dispatch/driver-pwa/load/${LOAD_A}/stops/${STOP_A}/arrival`,
      payload: { geo_lat: 27.5, geo_lng: -99.5, geo_accuracy_m: 10 },
    });
    expect(res.statusCode).toBe(403);
  });

  it("POST document links evidence to stop", async () => {
    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("JOIN mdata.loads l ON l.id = s.load_id")) {
        return { rows: [{ id: STOP_A, operating_company_id: "11111111-1111-4111-8111-111111111111" }] };
      }
      if (sql.includes("FROM documents.evidence_records")) {
        expect(values?.[0]).toBe(EVIDENCE);
        return { rows: [{ id: EVIDENCE }] };
      }
      return { rows: [] };
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/dispatch/driver-pwa/load/${LOAD_A}/stops/${STOP_A}/document`,
      payload: { evidence_uuid: EVIDENCE, doc_type: "bol" },
    });
    expect(res.statusCode).toBe(201);
    expect(mockAppendCrudAudit).toHaveBeenCalled();
  });

  it("driver B cannot read driver A load (RLS isolation)", async () => {
    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("assigned_primary_driver_id")) {
        expect(values?.[1]).toBe(DRIVER_B);
        return { rows: [] };
      }
      return { rows: [] };
    });

    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.decorateRequest("driver", null);
    app.addHook("preHandler", async (req) => {
      req.user = { uuid: "user-b", role: "Driver", email: "other@ih35.local" };
      req.driver = {
        id: DRIVER_B,
        full_name: "Driver B",
        status: "Active",
        preferred_language: "en",
      };
    });
    await registerDispatchViewRoutes(app);
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: `/api/dispatch/driver-pwa/load/${LOAD_A}/dispatch-view`,
    });
    expect(res.statusCode).toBe(403);
  });
});
