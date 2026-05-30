import { describe, expect, it, vi } from "vitest";
import { createDraftBatch, FactoringBatchError } from "./batch.service.js";
import { assignCustomerToFactor, deactivateFactor, getFactorForCustomer } from "./factor.service.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const customerA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const customerB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const factorA = "f0f0f0f0-1111-4111-8111-f0f0f0f0f0f0";
const factorB = "f1f1f1f1-1111-4111-8111-f1f1f1f1f1f1";

function buildFactorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: factorA,
    tenant_id: tenantId,
    name: "Northwind",
    advance_rate: "0.95",
    fee_rate: "0.025",
    reserve_rate: "0.10",
    recourse_days: 90,
    active: true,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    assignment_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    effective_from: "2026-05-01",
    effective_to: null,
    ...overrides,
  };
}

describe("factor service", () => {
  it("returns middle-of-range assignment match", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM factoring.customer_factor_assignment a")) {
        expect(values).toEqual([tenantId, customerA, "2026-05-15"]);
        return {
          rows: [
            buildFactorRow({
              effective_from: "2026-05-01",
              effective_to: "2026-06-01",
            }),
          ],
        };
      }
      return { rows: [] };
    });

    const factor = await getFactorForCustomer(tenantId, customerA, "2026-05-15", { client: { query } });
    expect(factor?.id).toBe(factorA);
    expect(factor?.effective_from).toBe("2026-05-01");
    expect(factor?.effective_to).toBe("2026-06-01");
  });

  it("uses most-recent assignment when multiple ranges exist", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM factoring.customer_factor_assignment a")) {
        expect(sql).toContain("ORDER BY a.effective_from DESC");
        return {
          rows: [
            buildFactorRow({
              id: factorB,
              name: "Summit",
              effective_from: "2026-06-01",
            }),
          ],
        };
      }
      return { rows: [] };
    });

    const factor = await getFactorForCustomer(tenantId, customerA, "2026-06-15", { client: { query } });
    expect(factor?.id).toBe(factorB);
    expect(factor?.name).toBe("Summit");
  });

  it("returns null when no assignment exists", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const factor = await getFactorForCustomer(tenantId, customerA, "2026-05-15", { client: { query } });
    expect(factor).toBeNull();
  });

  it("closes active assignment and inserts new one with effective boundaries", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("SELECT id::text") && sql.includes("FROM factoring.factor")) {
        return { rows: [{ id: factorA }] };
      }
      if (sql.includes("UPDATE factoring.customer_factor_assignment")) {
        expect(values).toEqual([tenantId, customerA, "2026-06-01"]);
        expect(sql).toContain("effective_to = ($3::date - INTERVAL '1 day')::date");
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO factoring.customer_factor_assignment")) {
        expect(values).toEqual([tenantId, customerA, factorA, "2026-06-01"]);
        return {
          rows: [
            {
              id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
              tenant_id: tenantId,
              customer_id: customerA,
              factor_id: factorA,
              effective_from: "2026-06-01",
              effective_to: null,
              created_at: "2026-06-01T00:00:00.000Z",
            },
          ],
        };
      }
      if (sql.includes("SELECT name") && sql.includes("FROM factoring.factor")) {
        return { rows: [{ name: "Northwind" }] };
      }
      return { rows: [] };
    });

    const assignment = await assignCustomerToFactor(tenantId, customerA, factorA, "2026-06-01", { client: { query } });
    expect(assignment.effective_from).toBe("2026-06-01");
    expect(assignment.effective_to).toBeNull();
  });

  it("deactivateFactor sets active false without deleting factor references", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("UPDATE factoring.factor") && sql.includes("SET active = false")) {
        return {
          rows: [
            {
              id: factorA,
              tenant_id: tenantId,
              name: "Northwind",
              advance_rate: "0.95",
              fee_rate: "0.025",
              reserve_rate: "0.10",
              recourse_days: 90,
              active: false,
              created_at: "2026-05-01T00:00:00.000Z",
              updated_at: "2026-06-01T00:00:00.000Z",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const factor = await deactivateFactor(tenantId, factorA, { client: { query } });
    expect(factor.active).toBe(false);
    const executedSql = query.mock.calls.map((call) => String(call[0]));
    expect(executedSql.some((sql) => sql.includes("DELETE FROM factoring.factor"))).toBe(false);
  });

  it("enforces tenant isolation in lookup query", async () => {
    const query = vi.fn(async (_sql: string, values?: unknown[]) => {
      expect(values?.[0]).toBe(tenantB);
      return { rows: [] };
    });

    const factor = await getFactorForCustomer(tenantB, customerA, "2026-05-15", { client: { query } });
    expect(factor).toBeNull();
  });

  it("treats effective_to as exclusive boundary", async () => {
    const query = vi.fn(async (_sql: string, values?: unknown[]) => {
      const asOf = String(values?.[2]);
      if (asOf === "2026-06-30") {
        return {
          rows: [
            buildFactorRow({
              effective_from: "2026-06-01",
              effective_to: "2026-07-01",
            }),
          ],
        };
      }
      return { rows: [] };
    });

    const inside = await getFactorForCustomer(tenantId, customerA, "2026-06-30", { client: { query } });
    const boundary = await getFactorForCustomer(tenantId, customerA, "2026-07-01", { client: { query } });

    expect(inside?.id).toBe(factorA);
    expect(boundary).toBeNull();
  });
});

describe("batch factor enforcement", () => {
  it("blocks mixed-factor invoice lists with customer/factor pairs", async () => {
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM accounting.invoices i") && sql.includes("COALESCE(i.factoring_status, 'not_factored') = 'not_factored'")) {
        return {
          rows: [
            {
              id: "11111111-aaaa-4aaa-8aaa-111111111111",
              customer_id: customerA,
              factor_as_of_date: "2026-06-10",
              total_cents: 100000,
            },
            {
              id: "22222222-bbbb-4bbb-8bbb-222222222222",
              customer_id: customerB,
              factor_as_of_date: "2026-06-10",
              total_cents: 120000,
            },
          ],
        };
      }

      if (sql.includes("FROM factoring.customer_factor_assignment a")) {
        const customerId = String(values?.[1] ?? "");
        if (customerId === customerA) {
          return {
            rows: [
              buildFactorRow({
                id: factorA,
                name: "Northwind",
              }),
            ],
          };
        }
        return {
          rows: [
            buildFactorRow({
              id: factorB,
              name: "Summit",
            }),
          ],
        };
      }

      return { rows: [] };
    });

    await expect(
      createDraftBatch(
        tenantId,
        ["11111111-aaaa-4aaa-8aaa-111111111111", "22222222-bbbb-4bbb-8bbb-222222222222"],
        { client: { query }, now: new Date("2026-06-30T12:00:00.000Z") }
      )
    ).rejects.toMatchObject<FactoringBatchError>({
      code: "mixed_factors_not_allowed",
      statusCode: 400,
      details: {
        customer_factors: [
          { customer_id: customerA, factor_id: factorA, factor_name: "Northwind" },
          { customer_id: customerB, factor_id: factorB, factor_name: "Summit" },
        ],
      },
    });
  });
});
