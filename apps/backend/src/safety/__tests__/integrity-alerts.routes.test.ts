import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerSafetyIntegrityAlertsRoutes } from "../integrity-alerts.routes.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const ALERT_ID = "22222222-2222-4222-8222-222222222222";
const RULE_ID = "33333333-3333-4333-8333-333333333333";

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

vi.mock("../integrity-alert-engine.service.js", () => ({
  listIntegrityAlertRules: vi.fn(async () => [{ id: RULE_ID, rule_code: "fuel_anomaly" }]),
  evaluateIntegrityRulesForTenant: vi.fn(async () => ({
    rules_scanned: 1,
    events_inserted: 1,
    alerts_inserted: 1,
  })),
}));

function mockDbQuery() {
  return vi.fn(async (sql: string) => {
    if (sql.includes("SET LOCAL app.operating_company_id")) {
      return { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 0 };
  });
}

describe("safety integrity alerts routes (A23-12)", () => {
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
    await registerSafetyIntegrityAlertsRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/v1/safety/integrity-alerts lists inbox (canonical path)", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      return { rows: [{ id: ALERT_ID, alert_category: "driver_mpg_anomaly" }], rowCount: 1 };
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/safety/integrity-alerts?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      integrity_alerts: [{ id: ALERT_ID, alert_category: "driver_mpg_anomaly" }],
    });
  });

  it("GET /api/v1/safety/integrity-alert-rules returns rules", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/safety/integrity-alert-rules?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().integrity_alert_rules[0]?.rule_code).toBe("fuel_anomaly");
  });

  it("POST /api/v1/safety/integrity-alerts/:id/snooze sets snooze", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET LOCAL")) return { rows: [], rowCount: 0 };
      if (sql.includes("UPDATE safety.integrity_alerts")) {
        return { rows: [{ id: ALERT_ID, snoozed_until: "2026-06-05T00:00:00.000Z", event_id: null }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/safety/integrity-alerts/${ALERT_ID}/snooze?operating_company_id=${COMPANY}`,
      payload: { snooze_hours: 24 },
    });
    expect(res.statusCode).toBe(200);
    expect(mockAppendCrudAudit).toHaveBeenCalled();
  });

  it("POST /api/v1/safety/integrity-alerts/evaluate runs engine", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/safety/integrity-alerts/evaluate?operating_company_id=${COMPANY}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ rules_scanned: 1, alerts_inserted: 1 });
  });
});
