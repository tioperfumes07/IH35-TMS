import { describe, expect, it, vi } from "vitest";
import { settlementDisplayIdFromLoadNumber, aggregateSettlementTotals } from "../settlements-load-bookended.service.js";

describe("load-bookended settlements", () => {
  it("maps settlement display ids from load numbers", () => {
    expect(settlementDisplayIdFromLoadNumber("L-13518")).toBe("S-13518");
    expect(settlementDisplayIdFromLoadNumber("l-999")).toBe("S-999");
  });

  it("aggregates settlement totals from settlement_lines", async () => {
    const client = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("FROM driver_finance.settlement_lines")) {
          return {
            rows: [{ earnings: "100.00", deductions: "10.00", reimbursements: "5.00" }],
          };
        }
        if (sql.includes("UPDATE driver_finance.driver_settlements")) {
          return { rows: [] };
        }
        throw new Error(`unexpected sql in test: ${sql}`);
      }),
    };

    const totals = await aggregateSettlementTotals(client as never, "00000000-0000-4000-8000-0000000000bb");
    expect(totals.gross_pay).toBe(100);
    expect(totals.deductions_total).toBe(10);
    expect(totals.reimbursements_total).toBe(5);
    expect(totals.net_pay).toBe(95);
  });
});
