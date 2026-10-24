import { beforeEach, expect, it, vi } from "vitest";
const request = vi.hoisted(() => vi.fn());
vi.mock("./client", () => ({ apiRequest: request }));
import { listAllSettlements, listAllSettlementDeductions } from "./driverFinance";
beforeEach(() => request.mockReset());
it("loads every selected settlement page and retains the server aggregate", async () => {
  request.mockResolvedValueOnce({ settlements: Array.from({ length: 200 }, (_, id) => ({ id: String(id) })), total_count: 201, kpi: { total_unpaid: 201 } })
    .mockResolvedValueOnce({ settlements: [{ id: "200" }], total_count: 201 });
  const result = await listAllSettlements("company", { driver_id: "driverA,driverB" });
  expect(result.settlements).toHaveLength(201);
  expect(result.kpi?.total_unpaid).toBe(201);
  expect(request.mock.calls[1][0]).toContain("driver_id=driverA%2CdriverB");
  expect(request.mock.calls[1][0]).toContain("offset=200");
});
it("does not publish partial settlement totals when the cohort changes", async () => {
  request.mockResolvedValueOnce({ settlements: [{ id: "a" }], total_count: 2 })
    .mockResolvedValueOnce({ settlements: [{ id: "b" }], total_count: 3 });
  await expect(listAllSettlements("company")).rejects.toThrow("cohort changed");
});
it("loads deductions past 500 without summing overlapping pages", async () => {
  request.mockResolvedValueOnce({ deductions: Array.from({ length: 500 }, (_, id) => ({ id: String(id) })) })
    .mockResolvedValueOnce({ deductions: [{ id: "500" }] });
  expect((await listAllSettlementDeductions("company", { driver_id: "a,b" })).deductions).toHaveLength(501);
  expect(request.mock.calls[1][0]).toContain("offset=500");
});
it("refuses duplicate deductions instead of presenting a false total", async () => {
  request.mockResolvedValueOnce({ deductions: Array.from({ length: 500 }, (_, id) => ({ id: String(id) })) })
    .mockResolvedValueOnce({ deductions: [{ id: "0" }] });
  await expect(listAllSettlementDeductions("company")).rejects.toThrow("repeated records");
});
