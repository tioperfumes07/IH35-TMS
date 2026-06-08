import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthState = { allowed: true };

const MISSING_POLICY_ID = "99999999-9999-4999-8999-999999999999";
const OP_CO = "11111111-1111-4111-8111-111111111111";
const SOURCE_POLICY_ID = "22222222-2222-4222-8222-222222222222";
const NEW_POLICY_ID = "33333333-3333-4333-8333-333333333333";

const createPolicyBillScheduleMock = vi.fn(async () => ({ scheduleIds: [], billUuids: [], skipped: false }));

const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
  if (sql.includes("SET LOCAL app.operating_company_id")) return { rows: [] };

  if (sql.includes("INSERT INTO insurance.policy ") && sql.includes("RETURNING")) {
    // Source not found → zero rows inserted (clone-forward had nothing to copy).
    if (String(values?.[1]) === MISSING_POLICY_ID) return { rows: [] };
    return {
      rows: [
        {
          id: NEW_POLICY_ID,
          insurer_name: "Acme Mutual",
          policy_number: String(values?.[2]),
          coverage_type: "auto_liability",
          coverage_type_id: "44444444-4444-4444-8444-444444444444",
          effective_date: String(values?.[3]),
          expiry_date: String(values?.[4]),
          total_premium_cents: Number(values?.[5]),
          down_payment_cents: Number(values?.[6]),
          installment_count: Number(values?.[7]),
          due_day: 1,
          pay_day: 1,
          late_fee_pct: "0",
          insurer_email: null,
          agent_contact: null,
          status: "pending",
          vendor_id: "vendor-123",
          renewed_from_policy_id: String(values?.[1]),
          created_at: "2026-06-07T12:00:00.000Z",
          updated_at: "2026-06-07T12:00:00.000Z",
        },
      ],
    };
  }

  if (sql.includes("INSERT INTO insurance.policy_unit")) return { rows: [] };

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

vi.mock("../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async () => undefined),
}));

vi.mock("./coi-pdf-renderer.service.js", () => ({
  renderCoiPdf: vi.fn(async () => null),
}));

vi.mock("./policy-bill-schedule.service.js", () => ({
  createPolicyBillSchedule: createPolicyBillScheduleMock,
}));

const { registerInsurancePolicyRoutes } = await import("./policy.routes.js");

describe("insurance policy renewal route", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  beforeEach(() => {
    requireAuthState.allowed = true;
    queryMock.mockClear();
    createPolicyBillScheduleMock.mockClear();
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
    await registerInsurancePolicyRoutes(app);
    return app;
  }

  const renewPayload = {
    operating_company_id: OP_CO,
    policy_number: "POL-2027-001",
    effective_date: "2027-01-01",
    expiry_date: "2028-01-01",
    total_premium_cents: 1200000,
    down_payment_cents: 200000,
    installment_count: 10,
  };

  it("clones the source policy, resets term fields, and stamps renewed_from_policy_id", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/insurance/policies/${SOURCE_POLICY_ID}/renew`,
      payload: renewPayload,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: NEW_POLICY_ID,
      policy_number: "POL-2027-001",
      effective_date: "2027-01-01",
      expiry_date: "2028-01-01",
      total_premium_cents: 1200000,
      down_payment_cents: 200000,
      installment_count: 10,
      status: "pending",
      renewed_from_policy_id: SOURCE_POLICY_ID,
    });

    // Units are clone-forwarded in the same scope.
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO insurance.policy_unit"))).toBe(true);
  });

  it("regenerates the bill schedule via createPolicyBillSchedule() in the same transaction", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: `/api/v1/insurance/policies/${SOURCE_POLICY_ID}/renew`,
      payload: renewPayload,
    });

    expect(createPolicyBillScheduleMock).toHaveBeenCalledTimes(1);
    expect(createPolicyBillScheduleMock.mock.calls[0]?.[0]).toBe(NEW_POLICY_ID);
  });

  it("does not bill when installment_count is 0", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/insurance/policies/${SOURCE_POLICY_ID}/renew`,
      payload: { ...renewPayload, installment_count: 0 },
    });

    expect(response.statusCode).toBe(201);
    expect(createPolicyBillScheduleMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the source policy does not exist", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/insurance/policies/${MISSING_POLICY_ID}/renew`,
      payload: renewPayload,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "policy_not_found" });
    expect(createPolicyBillScheduleMock).not.toHaveBeenCalled();
  });

  it("returns 403 for roles that cannot mutate", async () => {
    const app = await buildApp("Driver");
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/insurance/policies/${SOURCE_POLICY_ID}/renew`,
      payload: renewPayload,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "forbidden" });
  });

  it("returns 502 when the bill schedule fails (renewal rolled back)", async () => {
    createPolicyBillScheduleMock.mockRejectedValueOnce(new Error("insurance_vendor_not_resolvable"));
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/insurance/policies/${SOURCE_POLICY_ID}/renew`,
      payload: renewPayload,
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: "bill_schedule_failed" });
  });
});
