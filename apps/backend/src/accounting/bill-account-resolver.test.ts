// CHAIN-03 — proof of THE ONE canonical bill resolver order + every fail-loud path.
// Mocks the two underlying resolvers (no DB), so it is deterministic everywhere.
import { describe, expect, it, vi, beforeEach } from "vitest";

const { resolveAccountForCategory, resolveRoleAccountOptional } = vi.hoisted(() => ({
  resolveAccountForCategory: vi.fn(),
  resolveRoleAccountOptional: vi.fn(),
}));

vi.mock("./expense-category-map/resolver.service.js", async () => {
  const actual = await vi.importActual<typeof import("./expense-category-map/resolver.service.js")>(
    "./expense-category-map/resolver.service.js"
  );
  return { ...actual, resolveAccountForCategory };
});
vi.mock("./coa-roles/resolver.service.js", () => ({ resolveRoleAccountOptional }));

import { BillLineAccountError, resolveBillLineDebitAccount } from "./bill-account-resolver.js";
import { ExpenseCategoryMapResolutionError } from "./expense-category-map/resolver.service.js";

const TRANSP = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const client = { query: vi.fn() } as never;

beforeEach(() => {
  vi.clearAllMocks();
  resolveRoleAccountOptional.mockImplementation(async (_c: unknown, _o: string, role: string) =>
    role === "uncategorized_expense" ? "acct-uncat" : null
  );
});

describe("resolveBillLineDebitAccount — canonical order", () => {
  it("tier 1: explicit account override is honored (no resolver calls)", async () => {
    const r = await resolveBillLineDebitAccount(client, TRANSP, {
      explicit_account_id: "acct-explicit",
      category_kind: "fuel",
      category_code: "FUEL",
    });
    expect(r).toEqual({ account_id: "acct-explicit", method: "bill_line_explicit_account", category_label: "Per-line account override" });
    expect(resolveAccountForCategory).not.toHaveBeenCalled();
    expect(resolveRoleAccountOptional).not.toHaveBeenCalled();
  });

  it("tier 2: category present → expense_category_account_map", async () => {
    resolveAccountForCategory.mockResolvedValue({ account_id: "acct-fuel", posting_side: "debit" });
    const r = await resolveBillLineDebitAccount(client, TRANSP, { category_kind: "fuel", category_code: "FUEL" });
    expect(resolveAccountForCategory).toHaveBeenCalledWith(TRANSP, "fuel", "FUEL");
    expect(r).toEqual({ account_id: "acct-fuel", method: "expense_category_map", category_label: "fuel/FUEL" });
  });

  it("tier 3: no category → uncategorized_expense (QBO-25)", async () => {
    const r = await resolveBillLineDebitAccount(client, TRANSP, {});
    expect(resolveAccountForCategory).not.toHaveBeenCalled();
    expect(r.method).toBe("uncategorized_expense_role");
    expect(r.account_id).toBe("acct-uncat");
  });

  it("tier 4: category present but unmapped → FAIL LOUD (CATEGORY_MAPPING_MISSING)", async () => {
    resolveAccountForCategory.mockRejectedValue(new ExpenseCategoryMapResolutionError("none"));
    await expect(resolveBillLineDebitAccount(client, TRANSP, { category_kind: "fuel", category_code: "NOPE" }))
      .rejects.toThrowError(expect.objectContaining({ code: "CATEGORY_MAPPING_MISSING" }));
  });

  it("partial category (kind only) → CATEGORY_INCOMPLETE (no silent bucket)", async () => {
    await expect(resolveBillLineDebitAccount(client, TRANSP, { category_kind: "fuel" }))
      .rejects.toThrowError(expect.objectContaining({ code: "CATEGORY_INCOMPLETE" }));
  });

  it("partial category (code only) → CATEGORY_INCOMPLETE", async () => {
    await expect(resolveBillLineDebitAccount(client, TRANSP, { category_code: "FUEL" }))
      .rejects.toThrowError(expect.objectContaining({ code: "CATEGORY_INCOMPLETE" }));
  });

  it("invalid category_kind → CATEGORY_KIND_INVALID", async () => {
    await expect(resolveBillLineDebitAccount(client, TRANSP, { category_kind: "bogus", category_code: "X" }))
      .rejects.toThrowError(expect.objectContaining({ code: "CATEGORY_KIND_INVALID" }));
    expect(resolveAccountForCategory).not.toHaveBeenCalled();
  });

  it("no category + uncategorized role unmapped → FAIL LOUD (UNCATEGORIZED_UNRESOLVED)", async () => {
    resolveRoleAccountOptional.mockResolvedValue(null);
    await expect(resolveBillLineDebitAccount(client, TRANSP, {}))
      .rejects.toBeInstanceOf(BillLineAccountError);
    await expect(resolveBillLineDebitAccount(client, TRANSP, {}))
      .rejects.toThrowError(expect.objectContaining({ code: "UNCATEGORIZED_UNRESOLVED" }));
  });
});
