import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyAutoDeductionsToSettlement } from "./apply.js";
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

  // ── P2a materializer (owner DECISION 1, 2026-07-21): sub-ledger rows, NOT negative lines ──────

  type PolicyState = {
    id: string;
    deduction_type: string;
    total_owed_cents: number;
    deducted_so_far_cents: number;
    max_per_settlement_cents: number;
    memo: string | null;
    status: string;
  };

  type SubLedgerRow = { policy_id: string; amount_cents: number; reason: string; open: boolean };

  /** Stateful mock: policies + sub-ledger with the one-open-tranche-per-policy arbiter simulated. */
  function makeMaterializerMock(policies: PolicyState[]) {
    const subLedger: SubLedgerRow[] = [];
    const sqlLog: string[] = [];
    queryMock.mockImplementation(async (sql: string, values?: unknown[]) => {
      sqlLog.push(sql);
      if (sql.includes("to_regclass('driver_finance.driver_settlement_deductions')")) {
        return { rows: [{ table_ok: true, column_ok: true }] };
      }
      if (sql.includes("FROM driver_finance.auto_deduction_policies")) {
        return {
          rows: policies
            .filter((p) => p.status === "active" && p.deducted_so_far_cents < p.total_owed_cents)
            .map((p) => ({ ...p })),
        };
      }
      if (sql.includes("INSERT INTO driver_finance.driver_settlement_deductions")) {
        const policyId = String(values?.[5] ?? "");
        // ON CONFLICT ... WHERE applied_to_settlement_id IS NULL DO NOTHING: an existing OPEN
        // tranche for the same policy means no row is inserted and RETURNING yields nothing.
        if (subLedger.some((r) => r.policy_id === policyId && r.open)) return { rows: [] };
        subLedger.push({
          policy_id: policyId,
          amount_cents: Number(values?.[3] ?? 0),
          reason: String(values?.[4] ?? ""),
          open: true,
        });
        return { rows: [{ id: `ded-${subLedger.length}` }] };
      }
      if (sql.includes("UPDATE driver_finance.auto_deduction_policies")) {
        const policy = policies.find((p) => p.id === String(values?.[0] ?? ""));
        if (policy) {
          policy.deducted_so_far_cents = Number(values?.[1] ?? 0);
          if (values?.[2] === true) policy.status = "completed";
        }
        return { rows: [] };
      }
      return { rows: [] };
    });
    return { subLedger, sqlLog };
  }

  const MATERIALIZE_INPUT = {
    operatingCompanyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    driverId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    settlementId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    actorUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  };

  it("materializes a $100 tranche as a sub-ledger row (cents, policy-linked) — NO settlement_lines insert, NO totals patch", async () => {
    const policy: PolicyState = {
      id: "policy-1",
      deduction_type: "repair",
      total_owed_cents: 50000,
      deducted_so_far_cents: 0,
      max_per_settlement_cents: 10000,
      memo: "WO-22",
      status: "active",
    };
    const { subLedger, sqlLog } = makeMaterializerMock([policy]);

    const result = await applyAutoDeductionsToSettlement({ query: queryMock }, MATERIALIZE_INPUT);

    expect(result.schema_ready).toBe(true);
    expect(result.total_materialized_cents).toBe(10000);
    expect(result.materialized).toHaveLength(1);
    expect(result.materialized[0]?.amount_cents).toBe(10000);
    expect(result.materialized[0]?.policy_id).toBe("policy-1");
    expect(result.materialized[0]?.deduction_id).toBe("ded-1");

    // Sub-ledger row is cents, positive, policy-linked, with the reason format pinned.
    expect(subLedger).toHaveLength(1);
    expect(subLedger[0]).toMatchObject({ policy_id: "policy-1", amount_cents: 10000, open: true });
    expect(subLedger[0]?.reason).toBe("Auto-deduction (repair): WO-22");
    expect(subLedger[0]!.amount_cents).toBeGreaterThan(0);

    // Policy progress advanced at materialization.
    expect(policy.deducted_so_far_cents).toBe(10000);

    // DECISION 1 core pins: never writes settlement_lines, never patches settlement totals.
    expect(sqlLog.some((s) => s.includes("INSERT INTO driver_finance.settlement_lines"))).toBe(false);
    expect(sqlLog.some((s) => s.includes("UPDATE driver_finance.driver_settlements"))).toBe(false);
  });

  it("idempotent re-run: an existing OPEN tranche blocks a second materialization (no double-charge)", async () => {
    const policy: PolicyState = {
      id: "policy-1",
      deduction_type: "cash_advance",
      total_owed_cents: 50000,
      deducted_so_far_cents: 0,
      max_per_settlement_cents: 10000,
      memo: null,
      status: "active",
    };
    const { subLedger } = makeMaterializerMock([policy]);

    const first = await applyAutoDeductionsToSettlement({ query: queryMock }, MATERIALIZE_INPUT);
    expect(first.total_materialized_cents).toBe(10000);
    expect(policy.deducted_so_far_cents).toBe(10000);

    // Re-run while the tranche is still open (not yet applied by the cap applier): the partial
    // unique arbiter yields no inserted row → nothing materialized, counter NOT advanced again.
    // Note deducted_so_far advanced to 10000, so remaining is 40000 — the policy is still active,
    // but its open tranche blocks a second insert.
    const second = await applyAutoDeductionsToSettlement({ query: queryMock }, MATERIALIZE_INPUT);
    expect(second.materialized).toHaveLength(0);
    expect(second.total_materialized_cents).toBe(0);
    expect(subLedger).toHaveLength(1);
    expect(policy.deducted_so_far_cents).toBe(10000);

    // Once the cap applier stamps applied_to_settlement_id (tranche leaves the partial index),
    // the next settlement materializes the next tranche.
    subLedger[0]!.open = false;
    const third = await applyAutoDeductionsToSettlement({ query: queryMock }, MATERIALIZE_INPUT);
    expect(third.total_materialized_cents).toBe(10000);
    expect(subLedger).toHaveLength(2);
    expect(policy.deducted_so_far_cents).toBe(20000);
  });

  it("completes the policy at the final tranche (five $100 tranches on $500 owed)", async () => {
    const policy: PolicyState = {
      id: "policy-1",
      deduction_type: "repair",
      total_owed_cents: 50000,
      deducted_so_far_cents: 0,
      max_per_settlement_cents: 10000,
      memo: null,
      status: "active",
    };
    const { subLedger } = makeMaterializerMock([policy]);

    for (let i = 0; i < 5; i += 1) {
      const res = await applyAutoDeductionsToSettlement({ query: queryMock }, MATERIALIZE_INPUT);
      expect(res.total_materialized_cents).toBe(10000);
      // Simulate the cap applier applying the tranche before the next settlement close.
      subLedger[subLedger.length - 1]!.open = false;
    }

    expect(policy.deducted_so_far_cents).toBe(50000);
    expect(policy.status).toBe("completed");
    expect(subLedger).toHaveLength(5);

    // A sixth run materializes nothing — the policy is completed.
    const after = await applyAutoDeductionsToSettlement({ query: queryMock }, MATERIALIZE_INPUT);
    expect(after.materialized).toHaveLength(0);
    expect(subLedger).toHaveLength(5);
  });

  it("materializes nothing when no active policies exist (paused)", async () => {
    const { subLedger } = makeMaterializerMock([
      {
        id: "policy-1",
        deduction_type: "repair",
        total_owed_cents: 50000,
        deducted_so_far_cents: 0,
        max_per_settlement_cents: 10000,
        memo: null,
        status: "paused",
      },
    ]);

    const result = await applyAutoDeductionsToSettlement({ query: queryMock }, MATERIALIZE_INPUT);
    expect(result.materialized).toHaveLength(0);
    expect(result.total_materialized_cents).toBe(0);
    expect(subLedger).toHaveLength(0);
  });

  it("no-ops (schema_ready=false) when the linkage column is not migrated yet", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("to_regclass('driver_finance.driver_settlement_deductions')")) {
        return { rows: [{ table_ok: true, column_ok: false }] };
      }
      throw new Error(`unexpected query when schema not ready: ${sql}`);
    });

    const result = await applyAutoDeductionsToSettlement({ query: queryMock }, MATERIALIZE_INPUT);
    expect(result.schema_ready).toBe(false);
    expect(result.materialized).toHaveLength(0);
  });
});
