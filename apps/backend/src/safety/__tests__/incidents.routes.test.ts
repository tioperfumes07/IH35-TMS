import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyIncidentsRoutes } from "../incidents.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const INCIDENT_ID = "22222222-2222-4222-8222-222222222222";

const { mockQuery, mockWithCurrentUser, mockAppendCrudAudit, mockPutObjectBytes } = vi.hoisted(() => {
  const query = vi.fn();
  const withCurrentUser = vi.fn(async (_userId: string, fn: (client: { query: typeof query }) => Promise<unknown>) =>
    fn({ query })
  );
  const appendCrudAudit = vi.fn(async () => undefined);
  const putObjectBytes = vi.fn(async () => undefined);
  return { mockQuery: query, mockWithCurrentUser: withCurrentUser, mockAppendCrudAudit: appendCrudAudit, mockPutObjectBytes: putObjectBytes };
});

vi.mock("../../storage/r2-client.js", () => ({
  isR2Configured: () => true,
  putObjectBytes: mockPutObjectBytes,
}));

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
    mockPutObjectBytes.mockClear();
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
      if (sql.includes("SET LOCAL") || sql.includes("set_config")) return { rows: [], rowCount: 0 };
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

  it("GET /api/v1/safety/incidents applies driver_id/unit_id/date_from/date_to filters (S-08)", async () => {
    const DRIVER = "33333333-3333-4333-8333-333333333333";
    const UNIT = "44444444-4444-4444-8444-444444444444";
    let seenSql = "";
    let seenParams: unknown[] = [];
    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("SET LOCAL") || sql.includes("set_config")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM mdata.drivers d")) {
        return { rows: [{ exists: 1 }], rowCount: 1 };
      }
      if (sql.includes("FROM safety.incidents")) {
        seenSql = sql;
        seenParams = values ?? [];
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });
    const res = await app.inject({
      method: "GET",
      url:
        `/api/v1/safety/incidents?operating_company_id=${COMPANY}` +
        `&incident_type=damage_report&driver_id=${DRIVER}&unit_id=${UNIT}` +
        `&date_from=2026-01-01&date_to=2026-01-31`,
    });
    expect(res.statusCode).toBe(200);
    expect(seenSql).toContain("i.driver_id");
    expect(seenSql).toContain("i.unit_id");
    expect(seenSql).toMatch(/incident_at/);
    expect(seenParams).toEqual(
      expect.arrayContaining([COMPANY, "damage_report", DRIVER, UNIT, "2026-01-01", "2026-01-31"])
    );
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
        return { rows: [{ id: INCIDENT_ID, incident_type: "damage_report", status: "open" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/safety/incidents",
      payload: {
        operating_company_id: COMPANY,
        incident_type: "damage_report",
        location: "Dock 3",
        description: "Seal broken",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ incident: { id: INCIDENT_ID, incident_type: "damage_report" } });
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
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ incident_id: INCIDENT_ID, photo_key: expect.stringContaining("photo.jpg") });
    expect(mockPutObjectBytes).toHaveBeenCalledWith(
      expect.stringContaining(`incidents/${COMPANY}/${INCIDENT_ID}/`),
      expect.any(Buffer),
      "image/jpeg"
    );
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
  const CLAIM_REASON_ID = "66666666-6666-4666-8666-666666666666";

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
    // The query pins operating_company_id, so a cross-entity claimant returns NO row → mismatch.
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM mdata.customers")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/safety/incidents",
      payload: {
        operating_company_id: COMPANY,
        incident_type: "cargo_claim",
        description: "Shortage",
        claim_reason_id: CLAIM_REASON_ID,
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
        claim_reason_id: CLAIM_REASON_ID,
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
        return { rows: [{ reason_code: "theft" }], rowCount: 1 };
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
        claim_reason_id: CLAIM_REASON_ID,
        claim_filed_at: "2026-06-01",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      incident: { id: INCIDENT_ID, incident_type: "cargo_claim", claim_reason_code: "theft" },
    });
    expect(mockAppendCrudAudit).toHaveBeenCalled();
  });

  // SC-TRAILER-FK — trailer_id now references mdata.equipment (trailers). Validate RLS-scoped
  // existence: a real equipment trailer persists; a truck uuid or a cross-entity trailer → 400.
  const TRAILER_EQUIPMENT_ID = "44444444-4444-4444-8444-444444444444";
  const TRUCK_UNIT_ID = "55555555-5555-4555-8555-555555555555";

  it("POST creates an incident with a valid equipment trailer (201)", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM mdata.equipment")) {
        return { rows: [{ id: TRAILER_EQUIPMENT_ID }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO safety.incidents")) {
        return {
          rows: [{ id: INCIDENT_ID, incident_type: "trailer_interchange", trailer_id: TRAILER_EQUIPMENT_ID }],
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
        incident_type: "trailer_interchange",
        description: "Interchange at yard",
        trailer_id: TRAILER_EQUIPMENT_ID,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ incident: { id: INCIDENT_ID, trailer_id: TRAILER_EQUIPMENT_ID } });
  });

  it("POST rejects a truck uuid used as a trailer (invalid_trailer)", async () => {
    // A truck id lives only in mdata.units → not found in mdata.equipment → 400.
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM mdata.equipment")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/safety/incidents",
      payload: {
        operating_company_id: COMPANY,
        incident_type: "trailer_interchange",
        description: "Wrong id",
        trailer_id: TRUCK_UNIT_ID,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_trailer");
  });

  it("POST rejects a cross-entity trailer not visible under scope (invalid_trailer)", async () => {
    // RLS hides an equipment row owned by / leased to another entity → not found → 400.
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM mdata.equipment")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/safety/incidents",
      payload: {
        operating_company_id: COMPANY,
        incident_type: "damage_report",
        description: "Foreign trailer",
        trailer_id: TRAILER_EQUIPMENT_ID,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_trailer");
  });
});
