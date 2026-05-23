import { describe, expect, it, vi } from "vitest";
import { postFactoringAdvanceEvent, postFactoringReleaseEvent } from "../poster.service.js";

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

describe("factoring posting Scenario 8 (VQ1 Option A)", () => {
  it("posts $8,000 factor advance and $1,800 customer-pay-factor release", async () => {
    mockQuery.mockReset();
    mockResolveRoleAccount.mockReset();
    mockResolveRoleAccountOptional.mockReset();
    mockResolveAccountForCategory.mockReset();
    mockNextPaymentDisplayId.mockReset();
    mockPostSourceTransaction.mockReset();

    mockResolveRoleAccount.mockResolvedValue("acc");
    mockResolveRoleAccountOptional.mockResolvedValue("acc");
    mockResolveAccountForCategory.mockResolvedValue({
      account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      posting_side: "debit",
    });
    mockNextPaymentDisplayId.mockResolvedValue("PAY-100");
    mockPostSourceTransaction.mockResolvedValue({
      result: "posted",
      posting_batch_id: "pb-1",
    });

    const paymentInserts: Array<{ method: string; amount: number; reference: string }> = [];
    const applicationAmounts: number[] = [];
    let paymentInsertCount = 0;

    mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
      if (sql.includes("SELECT set_config('app.operating_company_id'")) return { rows: [] };
      if (sql.includes("FROM accounting.factoring_advances") && sql.includes("advance_amount_cents::int")) {
        return {
          rows: [
            {
              id: "fac-1",
              display_id: "FAC-0001",
              advance_amount_cents: 800000,
              submitted_at: "2026-01-05T00:00:00.000Z",
              advanced_at: "2026-01-07T00:00:00.000Z",
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.factoring_advances") && sql.includes("released_at::text")) {
        return {
          rows: [
            {
              id: "fac-1",
              display_id: "FAC-0001",
              released_at: "2026-02-20T00:00:00.000Z",
            },
          ],
        };
      }
      if (sql.includes("FROM accounting.invoices i") && sql.includes("factoring_advance_id = $1::uuid")) {
        return {
          rows: [{ invoice_id: "inv-8", customer_id: "cus-8", total_cents: 1000000 }],
        };
      }
      if (sql.includes("FROM accounting.payments") && sql.includes("payment_method = $3")) return { rows: [] };
      if (sql.includes("INSERT INTO accounting.payments")) {
        paymentInsertCount += 1;
        paymentInserts.push({
          method: String(values?.[3] ?? ""),
          amount: Number(values?.[6] ?? 0),
          reference: String(values?.[5] ?? ""),
        });
        return { rows: [{ id: `pay-${paymentInsertCount}` }] };
      }
      if (sql.includes("INSERT INTO accounting.payment_applications")) {
        applicationAmounts.push(Number(values?.[3] ?? 0));
        return { rows: [] };
      }
      return { rows: [] };
    });

    await postFactoringAdvanceEvent({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      factoring_advance_id: "22222222-2222-4222-8222-222222222222",
      actor_user_id: "33333333-3333-4333-8333-333333333333",
      advanced_at_iso: "2026-01-07T00:00:00.000Z",
    });

    await postFactoringReleaseEvent({
      operating_company_id: "11111111-1111-4111-8111-111111111111",
      factoring_advance_id: "22222222-2222-4222-8222-222222222222",
      actor_user_id: "33333333-3333-4333-8333-333333333333",
      released_at_iso: "2026-02-20T00:00:00.000Z",
      release_amount_cents: 180000,
      factor_fee_cents: 20000,
    });

    expect(paymentInserts).toEqual([
      { method: "factoring_advance", amount: 800000, reference: "FAC:FAC-0001:ADVANCE" },
      { method: "factoring_reserve", amount: 180000, reference: "FAC:FAC-0001:RELEASE" },
    ]);
    expect(applicationAmounts).toEqual([800000, 180000]);
    expect(mockPostSourceTransaction).toHaveBeenCalledTimes(2);
    expect(mockPostSourceTransaction).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ source_transaction_type: "customer_payment", source_transaction_id: "pay-1" }),
      expect.any(Object)
    );
    expect(mockPostSourceTransaction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ source_transaction_type: "customer_payment", source_transaction_id: "pay-2" }),
      expect.any(Object)
    );
  });
});
