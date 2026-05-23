import { describe, expect, it, vi } from "vitest";
import { ExpenseCategoryMapResolutionError, resolveInvoiceLineRevenueAccountId } from "../invoice-line-revenue-resolution.service.js";

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

describe("invoice-line revenue account resolution", () => {
  it("resolves revenue account_id for known revenue code", async () => {
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({
      account_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      posting_side: "credit",
    });

    const resolved = await resolveInvoiceLineRevenueAccountId("11111111-1111-4111-8111-111111111111", {
      line_type: "fsc",
    });

    expect(resolved.account_id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(resolved.revenue_code).toBe("fuel_surcharge");
    expect(mockResolveAccountForCategory).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "revenue",
      "fuel_surcharge"
    );
  });

  it("fails fast when revenue mapping is missing", async () => {
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockRejectedValue(
      new ExpenseCategoryMapResolutionError("No active expense category mapping")
    );

    await expect(
      resolveInvoiceLineRevenueAccountId("11111111-1111-4111-8111-111111111111", {
        line_type: "linehaul",
      })
    ).rejects.toThrow("No active expense category mapping");
  });

  it("refuses cross-tenant line resolution", async () => {
    mockResolveAccountForCategory.mockReset();

    await expect(
      resolveInvoiceLineRevenueAccountId("11111111-1111-4111-8111-111111111111", {
        line_type: "detention",
        line_operating_company_id: "22222222-2222-4222-8222-222222222222",
      })
    ).rejects.toThrow("invoice_line_cross_tenant_refused");
    expect(mockResolveAccountForCategory).not.toHaveBeenCalled();
  });
});
