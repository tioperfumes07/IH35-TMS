import { describe, expect, it } from "vitest";
import {
  buildCoaListRows,
  orderCoaHierarchy,
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
});
