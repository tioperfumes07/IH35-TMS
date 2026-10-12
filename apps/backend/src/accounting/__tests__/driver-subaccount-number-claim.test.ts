// 443.94 — a driver's <parent>…nnn must be free or already his; any other holder is refused by name (never a raw 23505).
import { describe, expect, it } from "vitest";
import { claimDriverSubAccountNumber, DriverSubAccountNumberTakenError } from "../driver-subaccount-number.js";

function fakeClient(parentNumber: string, held: { id: string; account_name: string; mine: boolean } | null) {
  return {
    query: async (sql: string) => {
      if (sql.includes("SELECT account_number FROM catalogs.accounts WHERE id")) return { rows: [{ account_number: parentNumber }] };
      return { rows: held ? [held] : [] };
    },
  };
}
const base = { operatingCompanyId: "co", parentId: "p", driverId: "d", nnn: "001" };

describe("claimDriverSubAccountNumber", () => {
  it("a free number is claimable (advance: 1245-00-001)", async () => {
    const r = await claimDriverSubAccountNumber(fakeClient("1245", null) as never, { ...base, joiner: "-00-" });
    expect(r).toEqual({ accountNumber: "1245-00-001", ownAccountId: null });
  });
  it("the driver's own account under that number is reused (escrow: 2100-00-001)", async () => {
    const r = await claimDriverSubAccountNumber(fakeClient("2100-00", { id: "a1", account_name: "X — Driver Escrow", mine: true }) as never, { ...base, joiner: "-" });
    expect(r).toEqual({ accountNumber: "2100-00-001", ownAccountId: "a1" });
  });
  it("a number held by another account is refused by name", async () => {
    await expect(claimDriverSubAccountNumber(fakeClient("1245", { id: "a9", account_name: "OTHER — Driver Cash Advance", mine: false }) as never, { ...base, joiner: "-00-" }))
      .rejects.toBeInstanceOf(DriverSubAccountNumberTakenError);
  });
});

describe("allocateDriverSubAccountNnn number space (443.94)", () => {
  it("counts driver sub-accounts under ANY parent, not only the five canonical numbers", async () => {
    const { allocateDriverSubAccountNnn } = await import("../driver-subaccount-number.js");
    const seen: string[] = [];
    const client = {
      query: async (sql: string) => {
        seen.push(sql);
        if (sql.includes("max(substring(a.account_number")) return { rows: [{ n: 1 }] }; // DADI…-00-001 held by another driver
        return { rows: [] };
      },
    };
    expect(await allocateDriverSubAccountNnn(client as never, "co", "d")).toBe("002");
    const maxSql = seen.find((q) => q.includes("max(substring(a.account_number"))!;
    expect(maxSql).toContain("driver_finance.driver_advance_accounts");
    expect(maxSql).toContain("accounting.escrow_accounts");
  });
});
