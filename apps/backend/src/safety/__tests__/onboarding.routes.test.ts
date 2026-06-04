import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ONBOARDING_STEP_KEYS, registerSafetyOnboardingRoutes } from "../onboarding.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const DRIVER_ID = "33333333-3333-4333-8333-333333333333";

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

function baseSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    operating_company_id: COMPANY,
    driver_id: DRIVER_ID,
    current_step: 1,
    status: "in_progress",
    step_data: {},
    admin_override: false,
    admin_override_reason: null,
    admin_override_by: null,
    created_at: "2026-06-04T12:00:00Z",
    updated_at: "2026-06-04T12:00:00Z",
    completed_at: null,
    ...overrides,
  };
}

describe("safety onboarding routes (A24-8)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockQuery.mockReset();
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
    await registerSafetyOnboardingRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("POST /api/v1/safety/onboarding/sessions creates session", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("INSERT INTO safety.onboarding_sessions")) {
        return { rows: [baseSession()], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/safety/onboarding/sessions",
      payload: { operating_company_id: COMPANY, driver_id: DRIVER_ID },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().session).toMatchObject({ id: SESSION_ID, current_step: 1 });
    expect(mockAppendCrudAudit).toHaveBeenCalled();
  });

  it("GET /api/v1/safety/onboarding/sessions/:session_id returns session + step keys", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM safety.onboarding_sessions")) {
        return { rows: [baseSession({ current_step: 3 })], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/safety/onboarding/sessions/${SESSION_ID}?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session.current_step).toBe(3);
    expect(body.steps).toEqual(ONBOARDING_STEP_KEYS);
  });

  it("PATCH step saves partial progress and can advance", async () => {
    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("SELECT step_data")) {
        return { rows: [baseSession()], rowCount: 1 };
      }
      if (sql.includes("UPDATE safety.onboarding_sessions")) {
        const stepData = JSON.parse(String(values?.[2] ?? "{}"));
        return {
          rows: [baseSession({ current_step: 2, step_data: stepData })],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/safety/onboarding/sessions/${SESSION_ID}/step?operating_company_id=${COMPANY}`,
      payload: {
        step: 1,
        step_data: { first_name: "Jane", last_name: "Driver", phone: "+15551234567" },
        advance: true,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().session.current_step).toBe(2);
    expect(res.json().session.step_data.identity).toMatchObject({ first_name: "Jane" });
  });

  it("PATCH step rejects completed sessions", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("SELECT step_data")) {
        return { rows: [baseSession({ status: "completed" })], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/api/v1/safety/onboarding/sessions/${SESSION_ID}/step?operating_company_id=${COMPANY}`,
      payload: { step: 2, step_data: { file_id: "f1" } },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "session_not_editable" });
  });

  it("POST complete marks session completed", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("UPDATE safety.onboarding_sessions") && sql.includes("status = 'completed'")) {
        return { rows: [baseSession({ status: "completed", current_step: 7, completed_at: "2026-06-04T13:00:00Z" })], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/safety/onboarding/sessions/${SESSION_ID}/complete?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().session.status).toBe("completed");
    expect(mockAppendCrudAudit).toHaveBeenCalled();
  });

  it("POST admin-override completes with reason", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("admin_override = true")) {
        return {
          rows: [
            baseSession({
              status: "completed",
              admin_override: true,
              admin_override_reason: "Prior employer verified CDL",
            }),
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/safety/onboarding/sessions/${SESSION_ID}/admin-override?operating_company_id=${COMPANY}`,
      payload: { reason: "Prior employer verified CDL on file", missing_steps: [2, 3] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().session.admin_override).toBe(true);
    expect(mockAppendCrudAudit).toHaveBeenCalled();
  });
});
