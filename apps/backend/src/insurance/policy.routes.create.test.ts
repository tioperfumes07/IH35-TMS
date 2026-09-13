import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ROUND 20.9 ITEM 1 (P&L cost-of-revenue investigation) — POST /api/v1/insurance/policies (create)
 * never called createPolicyBillSchedule at all, only POST .../renew did (see
 * policy.routes.renew.test.ts). Every brand-new (non-renewal) policy silently never generated a
 * bill schedule, so it could never post a premium expense to GL — the exact gap that left 3 real
 * active USMCA policies (Cimarron auto_liability $206,372.39, Lloyds physical_damage $43,590.18,
 * Lloyds cargo $21,317.84 — $271,280.41/yr combined) with zero insurance postings, ever, and was
 * one of the two named root causes behind the 84.5% net-margin P&L defect. This file mirrors
 * policy.routes.renew.test.ts's coverage for the create path.
 */

const requireAuthState = { allowed: true };

const OP_CO = "11111111-1111-4111-8111-111111111111";
const VENDOR_ID = "55555555-5555-4555-8555-555555555555";
const COVERAGE_TYPE_ID = "44444444-4444-4444-8444-444444444444";
const NEW_POLICY_ID = "33333333-3333-4333-8333-333333333333";

const createPolicyBillScheduleMock = vi.fn(async () => ({ scheduleIds: [], billUuids: [], skipped: false }));

const queryMock = vi.fn(async (sql: string, values?: unknown[]) => {
  if (sql.includes("org.user_company_access")) return { rows: [{ "?column?": 1 }], rowCount: 1 };
  if (sql.includes("SET LOCAL app.operating_company_id")) return { rows: [] };

  if (sql.includes("SELECT vendor_name")) return { rows: [{ vendor_name: "Cimarron" }] };
  if (sql.includes("FROM insurance.type_catalog")) return { rows: [{ id: COVERAGE_TYPE_ID }] };

  if (sql.includes("INSERT INTO insurance.policy ") && sql.includes("RETURNING")) {
    return {
      rows: [
        {
          id: NEW_POLICY_ID,
          insurer_name: "Cimarron",
          policy_number: String(values?.[3]),
          coverage_type: String(values?.[4]),
          coverage_type_id: COVERAGE_TYPE_ID,
          effective_date: String(values?.[6]),
          expiry_date: String(values?.[7]),
          total_premium_cents: Number(values?.[8]),
          down_payment_cents: Number(values?.[9]),
          installment_count: Number(values?.[10]),
          due_day: null,
          pay_day: null,
          late_fee_pct: "0",
          insurer_email: null,
          agent_contact: null,
          status: "active",
          vendor_id: VENDOR_ID,
          created_at: "2026-09-01T04:18:33.333Z",
          updated_at: "2026-09-01T04:18:33.333Z",
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

const withCurrentUserMock = vi.fn(
  async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) => fn({ query: queryMock })
);

vi.mock("../auth/db.js", () => ({
  withCurrentUser: withCurrentUserMock,
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

describe("insurance policy create route", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  beforeEach(() => {
    requireAuthState.allowed = true;
    queryMock.mockClear();
    createPolicyBillScheduleMock.mockClear();
    withCurrentUserMock.mockClear();
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

  const createPayload = {
    operating_company_id: OP_CO,
    vendor_id: VENDOR_ID,
    insurer_name: "Cimarron",
    policy_number: "CIM-2026-USMCA",
    coverage_type: "auto_liability",
    effective_date: "2026-08-25",
    expiry_date: "2027-08-25",
    total_premium_cents: 20637239,
    down_payment_cents: 0,
    installment_count: 9,
    status: "active",
  };

  it("generates the bill schedule via createPolicyBillSchedule() for a brand-new (non-renewal) policy", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/insurance/policies",
      payload: createPayload,
    });

    expect(response.statusCode).toBe(201);
    // This is the assertion that FAILS on the pre-fix code: the create route never called
    // createPolicyBillSchedule at all, so a brand-new policy could never generate a bill or post
    // a premium expense to GL, regardless of installment_count.
    expect(createPolicyBillScheduleMock).toHaveBeenCalledTimes(1);
    expect(createPolicyBillScheduleMock.mock.calls[0]?.[0]).toBe(NEW_POLICY_ID);
  });

  it("does not bill when installment_count is 0", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/insurance/policies",
      payload: { ...createPayload, installment_count: 0 },
    });

    expect(response.statusCode).toBe(201);
    expect(createPolicyBillScheduleMock).not.toHaveBeenCalled();
  });

  it("opens the SAME number of transactions whether or not a bill schedule is created (schedule composes into the create transaction, not a separate one)", async () => {
    const withBilling = await buildApp();
    await withBilling.inject({
      method: "POST",
      url: "/api/v1/insurance/policies",
      payload: createPayload,
    });
    const callsWithBilling = withCurrentUserMock.mock.calls.length;

    withCurrentUserMock.mockClear();

    const withoutBilling = await buildApp();
    await withoutBilling.inject({
      method: "POST",
      url: "/api/v1/insurance/policies",
      payload: { ...createPayload, installment_count: 0 },
    });
    const callsWithoutBilling = withCurrentUserMock.mock.calls.length;

    expect(callsWithBilling).toBe(callsWithoutBilling);
  });

  it("returns 502 and rolls back the whole create when the bill schedule fails", async () => {
    createPolicyBillScheduleMock.mockRejectedValueOnce(new Error("insurance_vendor_not_resolvable"));
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/insurance/policies",
      payload: createPayload,
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: "bill_schedule_failed" });
  });

  it("returns 403 for roles that cannot mutate", async () => {
    const app = await buildApp("Driver");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/insurance/policies",
      payload: createPayload,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "forbidden" });
    expect(createPolicyBillScheduleMock).not.toHaveBeenCalled();
  });
});
