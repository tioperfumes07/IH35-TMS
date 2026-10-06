import { describe, expect, it } from "vitest";
import {
  buildCoaListRows,
  orderCoaHierarchy,
  resolveBankAccount,
  resolveSyncBadge,
  statementFromAccountType,
  statementTag,
} from "../coa-list-utils";

describe("coa-list-utils", () => {
  it("maps balance-sheet and P&L account types", () => {
    expect(statementFromAccountType("Asset")).toBe("BS");
    expect(statementFromAccountType("Expense")).toBe("P&L");
    expect(statementTag("BS")).toBe("BAL");
    expect(statementTag("P&L")).toBe("P&L");
  });

  it("derives sync badge from metadata", () => {
    expect(resolveSyncBadge({ qbo_account_id: "99" })).toBe("synced");
    expect(resolveSyncBadge({})).toBe("local-only");
    expect(resolveSyncBadge({ qbo_sync_status: "qbo-only" })).toBe("qbo-only");
  });

  it("orders child accounts under parents", () => {
    const rows = buildCoaListRows(
      [
        {
          id: "child",
          code: "1100",
          display_name: "Child",
          description: null,
          metadata: { account_type: "Asset", parent_account_id: "parent" },
          is_active: true,
          sort_order: 2,
          created_at: "",
          updated_at: "",
        },
        {
          id: "parent",
          code: "1000",
          display_name: "Parent",
          description: null,
          metadata: { account_type: "Asset" },
          is_active: true,
          sort_order: 1,
          created_at: "",
          updated_at: "",
        },
      ],
      [],
      [],
      []
    );
    const ordered = orderCoaHierarchy(rows);
    expect(ordered.map((row) => row.id)).toEqual(["parent", "child"]);
    expect(ordered[1]?.depth).toBe(1);
  });

  // BANK-F91030 — feed_connected when Plaid name matches a bank/asset CoA row
  it("marks feed_connected when Plaid bank balance resolves", () => {
    const rows = buildCoaListRows(
      [
        {
          id: "wf",
          code: "1010",
          display_name: "WF - General Operating 6103",
          description: null,
          metadata: { account_type: "Bank" },
          is_active: true,
          sort_order: 1,
          created_at: "",
          updated_at: "",
        },
        {
          id: "exp",
          code: "6100",
          display_name: "Fuel",
          description: null,
          metadata: { account_type: "Expense" },
          is_active: true,
          sort_order: 2,
          created_at: "",
          updated_at: "",
        },
      ],
      [],
      [],
      [
        {
          id: "plaid-1",
          account_name: "WF - General Operating 6103",
          current_balance_cents: -19081,
        } as never,
      ]
    );
    const bank = rows.find((r) => r.id === "wf");
    const expense = rows.find((r) => r.id === "exp");
    expect(bank?.feed_connected).toBe(true);
    expect(bank?.bank_balance).not.toBe("—");
    expect(expense?.feed_connected).toBe(false);
  });

  it("maps catalog description onto CoA Description column", () => {
    const rows = buildCoaListRows(
      [
        {
          id: "wf",
          code: "1010",
          display_name: "WF Operating",
          description: "Wells Fargo operating checking",
          metadata: { account_type: "Bank" },
          is_active: true,
          sort_order: 1,
          created_at: "",
          updated_at: "",
        },
        {
          id: "blank",
          code: "9999",
          display_name: "Empty notes",
          description: "  ",
          metadata: { account_type: "Expense" },
          is_active: true,
          sort_order: 2,
          created_at: "",
          updated_at: "",
        },
      ],
      [],
      [],
      []
    );
    expect(rows.find((r) => r.id === "wf")?.description).toBe("Wells Fargo operating checking");
    expect(rows.find((r) => r.id === "blank")?.description).toBe("—");
  });
});

describe("resolveBankAccount — the feed account behind a GL account (ROUND 433.2)", () => {
  const acct = (over: Record<string, unknown>) =>
    ({ id: "ba", operating_company_id: "oc", institution_name: null, account_name: null, account_type: null, account_mask: null,
       current_balance_cents: 0, available_balance_cents: 0, currency_code: "USD", sync_status: "active", is_active: true,
       last_synced_at: null, ...over }) as never;
  it("a credit card on a Liability GL account resolves by ledger_account_id (the old Asset-only rule showed —)", () => {
    const card = acct({ id: "amex", account_name: "Amex-Scentsx", ledger_account_id: "gl-2400", current_balance_cents: 70_000 });
    expect(resolveBankAccount("gl-2400", "2400 Amex Card Payable", "Liability", [card])).toBe(card);
  });
  it("a feed linked to another GL account is never borrowed by a name match", () => {
    const checking = acct({ id: "chk", account_name: "USMCA FREIGHT", ledger_account_id: "gl-1010" });
    expect(resolveBankAccount("gl-1099", "USMCA FREIGHT Reserve", "Asset", [checking])).toBeNull();
  });
  it("an unlinked feed still matches by name (legacy)", () => {
    const petty = acct({ id: "pc", account_name: "Petty Cash", ledger_account_id: null });
    expect(resolveBankAccount("gl-1050", "Petty Cash", "Asset", [petty])).toBe(petty);
  });
});
