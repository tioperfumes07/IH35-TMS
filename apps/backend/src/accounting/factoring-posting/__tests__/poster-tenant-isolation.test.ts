import { describe, expect, it, vi } from "vitest";
import { postFactoringAdvanceEvent } from "../poster.service.js";

const {
  mockQuery,
  mockWithLuciaBypass,
  mockResolveRoleAccount,
  mockResolveRoleAccountOptional,
  mockResolveAccountForCategory,
  mockNextPaymentDisplayId,
  mockPostSourceTransaction,
} = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  return {
    mockQuery: query,
    mockWithLuciaBypass: withLuciaBypass,
    mockResolveRoleAccount: vi.fn(),
    mockResolveRoleAccountOptional: vi.fn(),
    mockResolveAccountForCategory: vi.fn(),
    mockNextPaymentDisplayId: vi.fn(),
    mockPostSourceTransaction: vi.fn(),
  };
});

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: mockWithLuciaBypass,
}));

vi.mock("../../coa-roles/resolver.service.js", () => ({
  resolveRoleAccount: mockResolveRoleAccount,
  resolveRoleAccountOptional: mockResolveRoleAccountOptional,
}));

vi.mock("../../expense-category-map/resolver.service.js", () => ({
  resolveAccountForCategory: mockResolveAccountForCategory,
}));

vi.mock("../../display-id.js", () => ({
  nextPaymentDisplayId: mockNextPaymentDisplayId,
}));

vi.mock("../../posting-engine.service.js", () => ({
  postSourceTransaction: mockPostSourceTransaction,
}));

describe("factoring posting tenant isolation", () => {
  it("sets operating_company scope and filters factoring advance lookups by tenant", async () => {
    mockQuery.mockReset();
    mockResolveRoleAccount.mockReset();
    mockResolveRoleAccountOptional.mockReset();
    mockNextPaymentDisplayId.mockReset();
    mockPostSourceTransaction.mockReset();

    mockResolveRoleAccount.mockResolvedValue("acc");
    mockResolveRoleAccountOptional.mockResolvedValue("acc");
    mockNextPaymentDisplayId.mockResolvedValue("PAY-100");
    mockPostSourceTransaction.mockResolvedValue({
      result: "posted",
      posting_batch_id: "pb-1",
    });

    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("FROM accounting.factoring_advances") && sql.includes("advance_amount_cents::int")) {
        return {
          rows: [
            {
              id: "fac-1",
              display_id: "FAC-1",
              advance_amount_cents: 800000,
              submitted_at: "2026-01-05T00:00:00.000Z",
              advanced_at: "2026-01-07T00:00:00.000Z",
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.invoices i") && sql.includes("factoring_advance_id = $1::uuid")) {
        return { rows: [{ invoice_id: "inv-1", customer_id: "cus-1", total_cents: 1000000 }] };
      }
      if (sql.includes("FROM accounting.payments") && sql.includes("payment_method = $3")) return { rows: [] };
      if (sql.includes("INSERT INTO accounting.payments")) return { rows: [{ id: "pay-1" }] };
      if (sql.includes("INSERT INTO accounting.payment_applications")) return { rows: [] };
      return { rows: [] };
    });

    await postFactoringAdvanceEvent({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      factoring_advance_id: "22222222-2222-4222-8222-222222222222",
      actor_user_id: "33333333-3333-4333-8333-333333333333",
      advanced_at_iso: "2026-01-07T00:00:00.000Z",
    });

    const setConfigCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes("set_config('app.operating_company_id'"));
    expect(setConfigCall?.[1]).toEqual(["11111111-1111-4111-8111-111111111111"]);

    const advanceSql = mockQuery.mock.calls.find(([sql]) => String(sql).includes("FROM accounting.factoring_advances"))?.[0];
    expect(String(advanceSql)).toContain("operating_company_id = $2::uuid");

    expect(mockResolveRoleAccount).toHaveBeenCalledWith(expect.anything(), "11111111-1111-4111-8111-111111111111", "ar_control");
    expect(mockResolveRoleAccount).toHaveBeenCalledWith(
      expect.anything(),
      "11111111-1111-4111-8111-111111111111",
      "factor_reserve_default"
    );
    expect(mockPostSourceTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        source_transaction_type: "customer_payment",
        source_transaction_id: "pay-1",
      }),
      expect.any(Object)
    );
  });
});
