// CHAIN-03 STEP-1 proof — the draft JE balances and every fail-loud path throws with its named code.
// Pure + mocked resolvers (no DB), so it is deterministic and runs in any environment.
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

import {
  BillGlDraftError,
  buildBillJeDraft,
  computeBillGlDraft,
} from "./bill-gl-draft.service.js";
import { ExpenseCategoryMapResolutionError } from "./expense-category-map/resolver.service.js";

const TRANSP = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

// Stub catalogs.accounts lookup: account_id → {account_number, account_name}.
const ACCOUNTS: Record<string, { account_number: string; account_name: string }> = {
  "acct-ap": { account_number: "2000", account_name: "Accounts payable" },
  "acct-fuel": { account_number: "6100", account_name: "Operating fuel expense" },
  "acct-maint": { account_number: "6200", account_name: "Repairs & maintenance" },
  "acct-uncat": { account_number: "QBO-25", account_name: "Uncategorized expense" },
};
const stubClient = {
  query: vi.fn(async (_sql: string, values?: unknown[]) => {
    const id = String(values?.[0] ?? "");
    const row = ACCOUNTS[id];
    return { rows: row ? [row] : [] };
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveRoleAccountOptional.mockImplementation(async (_c: unknown, _o: string, role: string) => {
    if (role === "ap_control") return "acct-ap";
    if (role === "uncategorized_expense") return "acct-uncat";
    return null;
  });
});

const ap = { account_id: "acct-ap", account_number: "2000", account_name: "Accounts payable" };
const fuelDebit = {
  account_id: "acct-fuel",
  account_number: "6100",
  account_name: "Operating fuel expense",
  amount_cents: 50_000,
  category_label: "fuel/FUEL",
  resolution_method: "expense_category_map" as const,
  description: "diesel",
};

describe("buildBillJeDraft (pure assembler)", () => {
  it("DR each line, one summed CR to A/P, balances", () => {
    const draft = buildBillJeDraft({
      operating_company_id: TRANSP,
      bill_label: "Bill TEST",
      posting_date: "2026-06-21",
      debits: [
        fuelDebit,
        { ...fuelDebit, account_id: "acct-maint", account_number: "6200", account_name: "Repairs & maintenance", amount_cents: 25_000, category_label: "maintenance/REPAIR" },
      ],
      ap,
    });
    expect(draft.balanced).toBe(true);
    expect(draft.total_debits_cents).toBe(75_000);
    expect(draft.total_credits_cents).toBe(75_000);
    expect(draft.writes_nothing).toBe(true);
    // last line is the single A/P credit for the full total
    const apLine = draft.lines.at(-1)!;
    expect(apLine.resolution_method).toBe("ap_control_role");
    expect(apLine.credit_cents).toBe(75_000);
    expect(apLine.debit_cents).toBe(0);
    expect(draft.lines.filter((l) => l.debit_cents > 0)).toHaveLength(2);
  });

  it("throws EMPTY_BILL when there are no lines", () => {
    expect(() => buildBillJeDraft({ operating_company_id: TRANSP, bill_label: "x", posting_date: null, debits: [], ap }))
      .toThrowError(expect.objectContaining({ code: "EMPTY_BILL" }));
  });

  it("throws INVALID_AMOUNT on non-positive or non-integer amounts", () => {
    expect(() => buildBillJeDraft({ operating_company_id: TRANSP, bill_label: "x", posting_date: null, debits: [{ ...fuelDebit, amount_cents: 0 }], ap }))
      .toThrowError(expect.objectContaining({ code: "INVALID_AMOUNT" }));
    expect(() => buildBillJeDraft({ operating_company_id: TRANSP, bill_label: "x", posting_date: null, debits: [{ ...fuelDebit, amount_cents: 12.5 }], ap }))
      .toThrowError(expect.objectContaining({ code: "INVALID_AMOUNT" }));
  });
});

describe("computeBillGlDraft (live resolution wiring)", () => {
  it("resolves a category line via expense_category_account_map and balances", async () => {
    resolveAccountForCategory.mockResolvedValue({ account_id: "acct-fuel", posting_side: "debit" });
    const draft = await computeBillGlDraft(stubClient, TRANSP, {
      bill_label: "Fuel bill",
      lines: [{ category_kind: "fuel", category_code: "FUEL", amount_cents: 50_000, description: "diesel" }],
    });
    expect(resolveAccountForCategory).toHaveBeenCalledWith(TRANSP, "fuel", "FUEL");
    expect(draft.balanced).toBe(true);
    expect(draft.lines[0].account_number).toBe("6100");
    expect(draft.lines[0].resolution_method).toBe("expense_category_map");
    expect(draft.lines.at(-1)!.account_number).toBe("2000");
  });

  it("a line with NO category → uncategorized_expense (QBO-25), not an error", async () => {
    const draft = await computeBillGlDraft(stubClient, TRANSP, {
      lines: [{ amount_cents: 13_000, description: "misc" }],
    });
    expect(resolveAccountForCategory).not.toHaveBeenCalled();
    expect(draft.lines[0].account_number).toBe("QBO-25");
    expect(draft.lines[0].resolution_method).toBe("uncategorized_expense_role");
    expect(draft.balanced).toBe(true);
  });

  it("a SPECIFIED category with no map entry → FAIL LOUD (CATEGORY_MAPPING_MISSING), no silent fallback", async () => {
    resolveAccountForCategory.mockRejectedValue(new ExpenseCategoryMapResolutionError("none"));
    await expect(
      computeBillGlDraft(stubClient, TRANSP, { lines: [{ category_kind: "fuel", category_code: "NOPE", amount_cents: 100 }] })
    ).rejects.toThrowError(expect.objectContaining({ code: "CATEGORY_MAPPING_MISSING" }));
  });

  it("missing ap_control role → FAIL LOUD (AP_UNRESOLVED)", async () => {
    resolveRoleAccountOptional.mockResolvedValue(null);
    await expect(
      computeBillGlDraft(stubClient, TRANSP, { lines: [{ amount_cents: 100 }] })
    ).rejects.toThrowError(expect.objectContaining({ code: "AP_UNRESOLVED" }));
  });

  it("missing uncategorized_expense role for an uncategorized line → FAIL LOUD (UNCATEGORIZED_UNRESOLVED)", async () => {
    resolveRoleAccountOptional.mockImplementation(async (_c: unknown, _o: string, role: string) =>
      role === "ap_control" ? "acct-ap" : null
    );
    await expect(
      computeBillGlDraft(stubClient, TRANSP, { lines: [{ amount_cents: 100 }] })
    ).rejects.toThrowError(expect.objectContaining({ code: "UNCATEGORIZED_UNRESOLVED" }));
  });

  it("throws BillGlDraftError instances (named codes), never a bare 500", async () => {
    resolveRoleAccountOptional.mockResolvedValue(null);
    await expect(
      computeBillGlDraft(stubClient, TRANSP, { lines: [{ amount_cents: 100 }] })
    ).rejects.toBeInstanceOf(BillGlDraftError);
  });
});
