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

// Cross-tenant guard: exercised in dedicated membership tests; no-op here so route logic (not membership) is under test.
vi.mock("../../_helpers/company-membership-guard.js", () => ({
  assertCompanyMembership: vi.fn(async () => undefined),
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

  // SC4 — Carmack/49 CFR 1005.2 cargo-claim intake validations.
  const CUSTOMER_ID = "33333333-3333-4333-8333-333333333333";

  it("POST rejects claim_* fields on a non-cargo_claim incident (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/safety/incidents",
      payload: {
        operating_company_id: COMPANY,
        incident_type: "damage_report",
        description: "Dent",
        claim_reason_code: "theft",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("validation_error");
  });

  it("POST rejects claimant from a different company (claimant_company_mismatch)", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM mdata.customers")) {
        return { rows: [{ operating_company_id: "99999999-9999-4999-8999-999999999999" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/safety/incidents",
      payload: {
        operating_company_id: COMPANY,
        incident_type: "cargo_claim",
        description: "Shortage",
        claimant_customer_id: CUSTOMER_ID,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("claimant_company_mismatch");
  });

  it("POST rejects an inactive/unknown claim reason (invalid_claim_reason)", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("catalogs.cargo_claim_reasons")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/safety/incidents",
      payload: {
        operating_company_id: COMPANY,
        incident_type: "cargo_claim",
        description: "Loss",
        claim_reason_code: "not_a_real_code",
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_claim_reason");
  });

  it("POST creates a cargo_claim with claimant + reason + filed date (201)", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM mdata.customers")) {
        return { rows: [{ operating_company_id: COMPANY }], rowCount: 1 };
      }
      if (sql.includes("catalogs.cargo_claim_reasons")) {
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO safety.incidents")) {
        return {
          rows: [
            {
              id: INCIDENT_ID,
              incident_type: "cargo_claim",
              claim_reason_code: "theft",
              claimant_customer_id: CUSTOMER_ID,
              claim_filed_at: "2026-06-01",
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/safety/incidents",
      payload: {
        operating_company_id: COMPANY,
        incident_type: "cargo_claim",
        description: "Theft in transit",
        damage_amount_cents: 125000,
        claimant_customer_id: CUSTOMER_ID,
        claim_reason_code: "theft",
        claim_filed_at: "2026-06-01",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      incident: { id: INCIDENT_ID, incident_type: "cargo_claim", claim_reason_code: "theft" },
    });
    expect(mockAppendCrudAudit).toHaveBeenCalled();
  });
});
