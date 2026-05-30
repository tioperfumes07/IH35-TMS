import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerInsurancePaymentScheduleRoutes } from "./payment-schedule.routes.js";

const requireAuthState = { allowed: true };

const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
  if (sql.includes("SET LOCAL app.operating_company_id")) return { rows: [] };

  if (sql.includes("FROM insurance.payment_schedule") && sql.includes("ORDER BY due_date ASC")) {
    return {
      rows: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          tenant_id: String(values?.[0] ?? ""),
          policy_id: String(values?.[1] ?? "22222222-2222-4222-8222-222222222222"),
          due_date: "2026-06-17",
          amount_cents: 125000,
          status: String(values?.[2] ?? "scheduled"),
          reminded_at: null,
          paid_at: null,
          late_fee_cents: 0,
          created_at: "2026-05-30T12:00:00.000Z",
          updated_at: "2026-05-30T12:00:00.000Z",
        },
      ],
    };
  }

  if (sql.includes("INSERT INTO insurance.payment_schedule")) {
    return {
      rows: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          tenant_id: String(values?.[0]),
          policy_id: String(values?.[1]),
          due_date: String(values?.[2]),
          amount_cents: Number(values?.[3]),
          status: String(values?.[4]),
          reminded_at: null,
          paid_at: null,
          late_fee_cents: 0,
          created_at: "2026-05-30T12:10:00.000Z",
          updated_at: "2026-05-30T12:10:00.000Z",
        },
      ],
    };
  }

  if (sql.includes("UPDATE insurance.payment_schedule")) {
    if (String(values?.[0]) === "99999999-9999-4999-8999-999999999999") return { rows: [] };
    return {
      rows: [
        {
          id: String(values?.[0]),
          tenant_id: String(values?.[1]),
          policy_id: "22222222-2222-4222-8222-222222222222",
          due_date: "2026-06-17",
          amount_cents: 125000,
          status: "paid",
          reminded_at: "2026-06-10T12:00:00.000Z",
          paid_at: "2026-06-11T12:00:00.000Z",
          late_fee_cents: 0,
          created_at: "2026-05-30T12:00:00.000Z",
          updated_at: "2026-06-11T12:00:00.000Z",
        },
      ],
    };
  }

  return { rows: [] };
});

vi.mock("../auth/session-middleware.js", () => ({
  requireAuth: (_req: unknown, reply: { code: (statusCode: number) => { send: (body: unknown) => void } }) => {
    if (requireAuthState.allowed) return true;
    reply.code(401).send({ error: "unauthorized" });
    return false;
  },
}));

vi.mock("../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

describe("insurance payment schedule routes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  beforeEach(() => {
    requireAuthState.allowed = true;
    queryMock.mockClear();
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function buildApp(role = "Owner") {
    const app = Fastify();
    apps.push(app);
    app.addHook("preHandler", async (req) => {
      (req as { user?: { uuid: string; role: string } }).user = {
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role,
      };
    });
    await registerInsurancePaymentScheduleRoutes(app);
    return app;
  }

  it("GET applies policy and status filters", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/insurance/payment-schedule?operating_company_id=11111111-1111-4111-8111-111111111111&policy_id=22222222-2222-4222-8222-222222222222&status=scheduled",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { payment_schedules: Array<{ id: string }> };
    expect(body.payment_schedules).toHaveLength(1);
    expect(body.payment_schedules[0]?.id).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("POST creates payment schedule row", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/insurance/payment-schedule",
      payload: {
        operating_company_id: "11111111-1111-4111-8111-111111111111",
        policy_id: "22222222-2222-4222-8222-222222222222",
        due_date: "2026-06-17",
        amount_cents: 125000,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: "33333333-3333-4333-8333-333333333333",
      status: "scheduled",
    });
  });

  it("PATCH marks payment schedule as paid", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/insurance/payment-schedule/11111111-1111-4111-8111-111111111111?operating_company_id=11111111-1111-4111-8111-111111111111",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      status: "paid",
    });
  });

  it("returns 401 when unauthenticated", async () => {
    const app = await buildApp();
    requireAuthState.allowed = false;
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/insurance/payment-schedule?operating_company_id=11111111-1111-4111-8111-111111111111",
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 403 for cross-tenant mark paid attempts", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/insurance/payment-schedule/99999999-9999-4999-8999-999999999999?operating_company_id=11111111-1111-4111-8111-111111111111",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "forbidden" });
  });
});
