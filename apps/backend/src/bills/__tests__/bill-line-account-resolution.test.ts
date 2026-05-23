import { describe, expect, it, vi } from "vitest";
import { ExpenseCategoryMapResolutionError, resolveBillLineAccountId } from "../bill-line-account-resolution.service.js";

const { mockResolveAccountForCategory } = vi.hoisted(() => {
  const resolveAccount = vi.fn();
  return {
    mockResolveAccountForCategory: resolveAccount,
  };
});

vi.mock("../../accounting/expense-category-map/resolver.service.js", () => ({
  resolveAccountForCategory: mockResolveAccountForCategory,
  ExpenseCategoryMapResolutionError: class extends Error {
    code = "EXPENSE_CATEGORY_MAP_NOT_FOUND";
    constructor(message: string) {
      super(message);
    }
  },
}));

describe("bill line account resolution", () => {
  it("resolves maintenance account_id for bill line", async () => {
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({
      account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      posting_side: "debit",
    });

    const result = await resolveBillLineAccountId("11111111-1111-4111-8111-111111111111", {
      description: "Brake service labor",
      line_type: "labor",
    });

    expect(result.account_id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(result.category_kind).toBe("maintenance");
    expect(result.category_code).toBe("brakes");
    expect(mockResolveAccountForCategory).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "maintenance",
      "brakes"
    );
  });

  it("fails fast when no active mapping exists", async () => {
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockRejectedValue(
      new ExpenseCategoryMapResolutionError("No active expense category mapping")
    );

    await expect(
      resolveBillLineAccountId("11111111-1111-4111-8111-111111111111", {
        description: "Unknown category line",
        line_type: "other",
      })
    ).rejects.toThrow("No active expense category mapping");
  });

  it("refuses cross-tenant line resolution input", async () => {
    mockResolveAccountForCategory.mockReset();

    await expect(
      resolveBillLineAccountId("11111111-1111-4111-8111-111111111111", {
        description: "AC service",
        line_type: "labor",
        line_operating_company_id: "22222222-2222-4222-8222-222222222222",
      })
    ).rejects.toThrow("bill_line_cross_tenant_refused");
    expect(mockResolveAccountForCategory).not.toHaveBeenCalled();
  });
});
