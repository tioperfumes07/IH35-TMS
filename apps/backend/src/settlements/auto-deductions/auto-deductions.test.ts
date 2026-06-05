import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyAutoDeductionsForSettlement } from "./apply.js";
import { registerAutoDeductionPolicyRoutes } from "./policy.routes.js";

const queryMock = vi.hoisted(() => vi.fn());
const requireAuthMock = vi.hoisted(() => vi.fn());

vi.mock("../../auth/db.js", () => ({
  withCurrentUser: async (_userId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
    fn({ query: queryMock }),
}));

vi.mock("../../accounting/shared.js", () => {
  const companyQuerySchema = {
    safeParse: (value: unknown) => {
      const data = value as { operating_company_id?: string };
      if (data?.operating_company_id) return { success: true as const, data: { operating_company_id: data.operating_company_id } };
      return { success: false as const, error: { flatten: () => ({}) } };
    },
    extend: (shape: Record<string, unknown>) => ({
      safeParse: (value: unknown) => {
        const data = value as Record<string, unknown>;
        if (data?.operating_company_id) return { success: true as const, data };
        return { success: false as const, error: { flatten: () => ({}) } };
      },
    }),
  };
  return {
    companyQuerySchema,
    currentAuthUser: () => ({ uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    validationError: (_reply: unknown, _err: unknown) => ({ error: "validation_error" }),
    withCompanyScope: async (_userId: string, _companyId: string, fn: (client: { query: typeof queryMock }) => Promise<unknown>) =>
      fn({ query: queryMock }),
  };
});

describe("auto-deduction policies (CLOSURE-4)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    queryMock.mockReset();
    requireAuthMock.mockReset();
    app = Fastify({ logger: false });
    await registerAutoDeductionPolicyRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates active policy with $500 owed and $100 max per settlement", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO driver_finance.auto_deduction_policies")) {
        return {
          rows: [
            {
              id: "policy-1",
              driver_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              deduction_type: "repair",
              total_owed_cents: 50000,
              deducted_so_far_cents: 0,
              max_per_settlement_cents: 10000,
              status: "active",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auto-deductions/policies?operating_company_id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      payload: {
        driver_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        deduction_type: "repair",
        total_owed_cents: 50000,
        max_per_settlement_cents: 10000,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { policy: { status: string; total_owed_cents: number } };
    expect(body.policy.status).toBe("active");
    expect(body.policy.total_owed_cents).toBe(50000);
  });

  it("applies $100 auto_deduction line and updates policy progress", async () => {
    const policyState = {
      id: "policy-1",
      deduction_type: "repair",
      total_owed_cents: 50000,
      deducted_so_far_cents: 0,
      max_per_settlement_cents: 10000,
      memo: "WO-22",
    };

    queryMock.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM driver_finance.auto_deduction_policies")) return { rows: [{ ...policyState }] };
      if (sql.includes("UPDATE driver_finance.auto_deduction_policies")) {
        policyState.deducted_so_far_cents = Number(values?.[1] ?? 0);
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await applyAutoDeductionsForSettlement(
      { query: queryMock },
      {
        operatingCompanyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        driverId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        settlementId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        deductionAccountId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      }
    );

    expect(result.total_deducted_cents).toBe(10000);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]?.amount_cents).toBe(10000);
    expect(policyState.deducted_so_far_cents).toBe(10000);
  });

  it("completes policy after five $100 settlement deductions", async () => {
    const policyState = {
      id: "policy-1",
      deduction_type: "repair",
      total_owed_cents: 50000,
      deducted_so_far_cents: 0,
      max_per_settlement_cents: 10000,
      memo: null as string | null,
      status: "active",
    };

    queryMock.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM driver_finance.auto_deduction_policies")) {
        if (policyState.status !== "active" || policyState.deducted_so_far_cents >= policyState.total_owed_cents) {
          return { rows: [] };
        }
        return { rows: [{ ...policyState }] };
      }
      if (sql.includes("UPDATE driver_finance.auto_deduction_policies")) {
        policyState.deducted_so_far_cents = Number(values?.[1] ?? 0);
        policyState.status = values?.[2] === true ? "completed" : "active";
        return { rows: [] };
      }
      return { rows: [] };
    });

    for (let i = 0; i < 5; i += 1) {
      await applyAutoDeductionsForSettlement(
        { query: queryMock },
        {
          operatingCompanyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          driverId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          settlementId: `cccccccc-cccc-4ccc-8ccc-cccccccccc${i}`,
          deductionAccountId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        }
      );
    }

    expect(policyState.deducted_so_far_cents).toBe(50000);
    expect(policyState.status).toBe("completed");
  });

  it("does not deduct when no active policies exist (paused)", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM driver_finance.auto_deduction_policies")) return { rows: [] };
      return { rows: [] };
    });

    const result = await applyAutoDeductionsForSettlement(
      { query: queryMock },
      {
        operatingCompanyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        driverId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        settlementId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        deductionAccountId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      }
    );
    expect(result.applied).toHaveLength(0);
    expect(result.total_deducted_cents).toBe(0);
  });
});
