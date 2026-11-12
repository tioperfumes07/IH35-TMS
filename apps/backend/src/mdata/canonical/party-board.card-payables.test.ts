import { beforeEach, describe, expect, it, vi } from "vitest";

const payableReader = vi.hoisted(() => vi.fn());
vi.mock("../../cash-flow/card-payables.js", () => ({ readCardPayableBalances: payableReader }));
vi.mock("./vendor-suggested-category.js", () => ({ readVendorSuggestedCategories: async () => new Map() }));
vi.mock("../../lib/company-business-date.js", () => ({ companyBusinessDate: () => "2026-11-12" }));
import { readVendorBoard } from "./party-board.service.js";

const client = { query: vi.fn(async (sql: string) => ({ rows: sql.includes("WITH exp AS") ? [] : [{ fuel: 90000, total: 100000 }] })) };

describe("ROUND 8.17 N31 vendor card liability", () => {
  beforeEach(() => {
    payableReader.mockReset();
    client.query.mockClear();
  });

  it("keeps liability balances separate from fuel spend and provides account source IDs", async () => {
    const balances = [
      { role: "fuel_card_payable_dreamline", account_id: "dreamline-account", account_name: "Dreamline", balance_cents: 12000, due_date: "2026-11-12" },
      { role: "fuel_card_payable_wex", account_id: "wex-account", account_name: "WEX", balance_cents: 3000, due_date: "2026-11-12" },
    ];
    payableReader.mockResolvedValue(balances);
    const report = await readVendorBoard(client, "company-a", "ytd", ["unit-a"]);
    expect(report.kpis.fuel_cents).toBe(90000);
    expect(report.kpis.card_payables_cents).toBe(15000);
    expect(report.card_payables).toEqual(balances);
    expect(report.card_payables_as_of).toBe("2026-11-12");
    expect(payableReader).toHaveBeenCalledWith(client, "company-a", "2026-11-12");
  });

  it("does not substitute spend when the canonical liability population is empty", async () => {
    payableReader.mockResolvedValue([]);
    const report = await readVendorBoard(client, "company-b", "all");
    expect(report.kpis.card_payables_cents).toBe(0);
    expect(report.kpis.fuel_cents).toBe(90000);
    expect(report.card_payables).toEqual([]);
  });

  it("does not manufacture a zero balance when the canonical reader rejects", async () => {
    payableReader.mockRejectedValue(new Error("liability unavailable"));
    await expect(readVendorBoard(client, "company-a", "12m")).rejects.toThrow("liability unavailable");
  });
});
