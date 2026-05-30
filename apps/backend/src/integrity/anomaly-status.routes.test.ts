import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerAnomalyStatusRoutes } from "./anomaly-status.routes.js";

const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
  if (sql.includes("set_config('app.operating_company_id'")) return { rows: [] };

  if (sql.includes("FROM integrity.anomalies") && sql.includes("ORDER BY")) {
    return {
      rows: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          tenant_id: String(values?.[0] ?? "33333333-3333-4333-8333-333333333333"),
          anomaly_type: "driver-without-medcard",
          severity: "high",
          subject_type: "driver",
          subject_id: "22222222-2222-4222-8222-222222222222",
          detected_at: "2026-05-29T00:00:00.000Z",
          detector_version: "int-3-v1",
          evidence: { reason: "missing medical card" },
          status: "new",
          status_changed_at: null,
          status_changed_by: null,
          resolution_note: null,
        },
      ],
    };
  }

  if (sql.includes("FROM integrity.anomalies") && sql.includes("LIMIT 1")) {
    if (String(values?.[1]) === "99999999-9999-4999-8999-999999999999") return { rows: [] };
    return {
      rows: [
        {
          id: String(values?.[0]),
          tenant_id: String(values?.[1]),
          anomaly_type: "unit-overdue-pm",
          severity: "medium",
          subject_type: "unit",
          subject_id: "44444444-4444-4444-8444-444444444444",
          detected_at: "2026-05-29T00:00:00.000Z",
          detector_version: "int-3-v1",
          evidence: { reason: "open pm alert" },
          status: "new",
          status_changed_at: null,
          status_changed_by: null,
          resolution_note: null,
        },
      ],
    };
  }

  if (sql.includes("UPDATE integrity.anomalies")) {
    if (String(values?.[1]) === "99999999-9999-4999-8999-999999999999") return { rows: [] };
    const status = sql.includes("status = 'resolved'")
      ? "resolved"
      : sql.includes("status = 'dismissed'")
        ? "dismissed"
        : "acknowledged";
    return {
      rows: [
        {
          id: String(values?.[0]),
          tenant_id: String(values?.[1]),
          anomaly_type: "orphaned-bill",
          severity: "medium",
          subject_type: "invoice",
          subject_id: "55555555-5555-4555-8555-555555555555",
          detected_at: "2026-05-29T00:00:00.000Z",
          detector_version: "int-3-v1",
          evidence: { reason: "bill has no lines" },
          status,
          status_changed_at: "2026-05-29T01:00:00.000Z",
          status_changed_by: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          resolution_note: values?.[3] ? String(values?.[3]) : null,
        },
      ],
    };
  }

  return { rows: [] };
});

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: () => true,
}));

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

describe("anomaly status routes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    queryMock.mockClear();
  });

  async function buildApp() {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "Owner",
      };
    });
    await registerAnomalyStatusRoutes(app);
    return app;
  }

  it("lists anomalies with filters", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/integrity/anomalies?operating_company_id=33333333-3333-4333-8333-333333333333&status=new&severity=high&subject=driver",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { anomalies: Array<{ id: string }> };
    expect(body.anomalies).toHaveLength(1);
    expect(body.anomalies[0]?.id).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("gets anomaly detail scoped by tenant", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/integrity/anomalies/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?operating_company_id=33333333-3333-4333-8333-333333333333",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { anomaly: { id: string; tenant_id: string } };
    expect(body.anomaly.id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(body.anomaly.tenant_id).toBe("33333333-3333-4333-8333-333333333333");
  });

  it("acknowledges an anomaly", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/integrity/anomalies/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/acknowledge",
      payload: { operating_company_id: "33333333-3333-4333-8333-333333333333" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { anomaly: { status: string } };
    expect(body.anomaly.status).toBe("acknowledged");
  });

  it("resolves an anomaly with note", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/integrity/anomalies/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/resolve",
      payload: {
        operating_company_id: "33333333-3333-4333-8333-333333333333",
        resolution_note: "driver document uploaded",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { anomaly: { status: string; resolution_note: string } };
    expect(body.anomaly.status).toBe("resolved");
    expect(body.anomaly.resolution_note).toBe("driver document uploaded");
  });

  it("dismisses an anomaly with note", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/integrity/anomalies/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/dismiss",
      payload: {
        operating_company_id: "33333333-3333-4333-8333-333333333333",
        resolution_note: "known false positive",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { anomaly: { status: string; resolution_note: string } };
    expect(body.anomaly.status).toBe("dismissed");
    expect(body.anomaly.resolution_note).toBe("known false positive");
  });

  it("enforces tenant scope and returns 404 when tenant does not own row", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/integrity/anomalies/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?operating_company_id=99999999-9999-4999-8999-999999999999",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "anomaly_not_found" });
  });
});
