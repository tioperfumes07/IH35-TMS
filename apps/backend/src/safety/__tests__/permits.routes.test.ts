import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyPermitsRoutes } from "../permits.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const PERMIT_ID = "22222222-2222-4222-8222-222222222222";

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

describe("safety permits routes (A23-13)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(mockDbQuery());
    mockAppendCrudAudit.mockClear();
    app = Fastify({ logger: false });
    app.decorateRequest("user", null);
    app.addHook("preHandler", async (req) => {
      req.user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Safety",
        email: "safety@ih35.local",
      };
    });
    await registerSafetyPermitsRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/v1/safety/permits lists permits with renewal alerts", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("permit_renewal_reminders")) {
        return { rows: [{ id: "rem-1", days_before_expiry: 30, enabled: true }], rowCount: 1 };
      }
      if (sql.includes("FROM safety.permits p") && sql.includes("<=")) {
        return {
          rows: [{ id: PERMIT_ID, permit_type: "state_operating_authority", days_to_expiry: 14, expiry_date: "2026-06-18" }],
          rowCount: 1,
        };
      }
      if (sql.includes("FROM safety.permits p")) {
        return {
          rows: [{ id: PERMIT_ID, permit_type: "state_operating_authority", days_to_expiry: 14, expiry_date: "2026-06-18" }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/safety/permits?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.permits).toHaveLength(1);
    expect(body.renewal_alerts).toHaveLength(1);
    expect(body.renewal_reminder).toMatchObject({ days_before_expiry: 30 });
  });

  it("POST /api/v1/safety/permits creates permit", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("INSERT INTO safety.permits")) {
        return {
          rows: [{ id: PERMIT_ID, permit_type: "hazmat", expiry_date: "2027-01-01", days_to_expiry: 210 }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/safety/permits",
      payload: {
        operating_company_id: COMPANY,
        permit_type: "hazmat",
        permit_number: "HZ-100",
        holder_name: "IH35 Transport",
        expiry_date: "2027-01-01",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ permit: { id: PERMIT_ID, permit_type: "hazmat" } });
    expect(mockAppendCrudAudit).toHaveBeenCalled();
  });

  it("PATCH /api/v1/safety/permits/:id updates permit", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("UPDATE safety.permits")) {
        return {
          rows: [{ id: PERMIT_ID, permit_number: "TX-OA-200", days_to_expiry: 90 }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/safety/permits/${PERMIT_ID}?operating_company_id=${COMPANY}`,
      payload: { permit_number: "TX-OA-200" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ permit: { permit_number: "TX-OA-200" } });
  });

  it("POST archive then restore round-trip", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("SET archived_at = now()")) {
        return { rows: [{ id: PERMIT_ID, archived_at: "2026-06-04T00:00:00Z" }], rowCount: 1 };
      }
      if (sql.includes("SET archived_at = NULL")) {
        return { rows: [{ id: PERMIT_ID, archived_at: null, days_to_expiry: 45 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const archiveRes = await app.inject({
      method: "POST",
      url: `/api/v1/safety/permits/${PERMIT_ID}/archive?operating_company_id=${COMPANY}`,
    });
    expect(archiveRes.statusCode).toBe(200);
    expect(archiveRes.json().permit.archived_at).toBeTruthy();

    const restoreRes = await app.inject({
      method: "POST",
      url: `/api/v1/safety/permits/${PERMIT_ID}/restore?operating_company_id=${COMPANY}`,
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.json().permit.archived_at).toBeNull();
  });
});
