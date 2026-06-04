import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyIncidentsRoutes } from "../incidents.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const INCIDENT_ID = "22222222-2222-4222-8222-222222222222";

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

function mockDbQuery() {
  return vi.fn(async (sql: string) => {
    if (sql.includes("SET LOCAL app.operating_company_id")) {
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  });
}

describe("safety incidents routes (A23-7)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(mockDbQuery());
    mockAppendCrudAudit.mockClear();
    app = Fastify({ logger: false });
    await app.register(multipart);
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Safety",
        email: "safety@ih35.local",
      };
    });
    await registerSafetyIncidentsRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/v1/safety/incidents lists by incident_type", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      return {
        rows: [{ id: INCIDENT_ID, incident_type: "damage_report", location: "Yard A" }],
        rowCount: 1,
      };
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/safety/incidents?operating_company_id=${COMPANY}&incident_type=damage_report`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      incidents: [{ id: INCIDENT_ID, incident_type: "damage_report", location: "Yard A" }],
    });
  });

  it("GET /api/v1/safety/incidents/:id returns incident detail", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      return { rows: [{ id: INCIDENT_ID, incident_type: "trailer_interchange" }], rowCount: 1 };
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/safety/incidents/${INCIDENT_ID}?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      incident: { id: INCIDENT_ID, incident_type: "trailer_interchange" },
    });
  });

  it("GET /api/v1/safety/incidents/:id returns 404 when missing", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/safety/incidents/${INCIDENT_ID}?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST /api/v1/safety/incidents creates incident", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("INSERT INTO safety.incidents")) {
        return { rows: [{ id: INCIDENT_ID, incident_type: "cargo_claim", status: "open" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/safety/incidents",
      payload: {
        operating_company_id: COMPANY,
        incident_type: "cargo_claim",
        location: "Dock 3",
        description: "Seal broken",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ incident: { id: INCIDENT_ID, incident_type: "cargo_claim" } });
    expect(mockAppendCrudAudit).toHaveBeenCalled();
  });

  it("POST /api/v1/safety/incidents/:id/photos appends photo key", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("UPDATE safety.incidents")) {
        return {
          rows: [{ id: INCIDENT_ID, photo_keys: ["incidents/x/photo.jpg"] }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/safety/incidents/${INCIDENT_ID}/photos?operating_company_id=${COMPANY}`,
      headers: { "content-type": "multipart/form-data; boundary=----test" },
      payload:
        "------test\r\nContent-Disposition: form-data; name=\"file\"; filename=\"photo.jpg\"\r\nContent-Type: image/jpeg\r\n\r\nfake\r\n------test--\r\n",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ incident_id: INCIDENT_ID, photo_key: expect.stringContaining("photo.jpg") });
  });

  it("POST /api/v1/safety/incidents rejects invalid body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/safety/incidents",
      payload: { operating_company_id: COMPANY, incident_type: "not_valid" },
    });
    expect(res.statusCode).toBe(400);
  });
});
