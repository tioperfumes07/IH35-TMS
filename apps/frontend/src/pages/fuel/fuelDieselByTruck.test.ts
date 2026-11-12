import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFuelTransactions, type FuelTransactionListItem } from "../../api/fuelPlanner";
import { fetchDieselByTruckAggregate } from "./fuelDieselByTruck";

vi.mock("../../api/fuelPlanner", () => ({ FUEL_TRANSACTIONS_MAX_PAGE: 200, getFuelTransactions: vi.fn() }));
const read = vi.mocked(getFuelTransactions);
const tx = (id: string, gallons: number | null, amount_cents = 10000): FuelTransactionListItem => ({
  id, gallons, amount_cents, transaction_date: "2026-11-01", driver_name: "Test driver", station: "Test station",
  driver_id: null, unit_id: "unit-a", unit_number: "TEST-A", trailer_id: null, trailer_number: null,
  load_id: null, load_number: null, vendor_id: null, vendor_name: null,
});
const run = () => fetchDieselByTruckAggregate("test-company", "2026-11-01", "2026-11-30");
const page = (transactions: FuelTransactionListItem[], total_count = transactions.length, has_more = false) =>
  ({ transactions, total_count, has_more, voided_count: 0 });

describe("Fuel truck reader canonical rate and complete population", () => {
  beforeEach(() => read.mockReset());
  it("keeps all spend but rates only positive-volume spend, matching fuel-period-spend", async () => {
    read.mockResolvedValue(page([tx("a", 20), tx("b", null, 2000), tx("c", 0, 3000), tx("d", -1, 4000)]));
    const result = await run();
    expect(result.total_spend_cents).toBe(19000);
    expect(result.total_gallons).toBe(20);
    expect(result.rows[0]).toMatchObject({ spend_cents: 19000, gallons: 20, avg_price_per_gallon: 5, fill_count: 4 });
  });
  it("returns an unknown rate, not zero, when every volume is missing", async () => {
    read.mockResolvedValue(page([tx("a", null), tx("b", 0)]));
    expect((await run()).rows[0]).toMatchObject({ spend_cents: 20000, gallons: 0, avg_price_per_gallon: null });
  });
  it("weights known volumes rather than averaging individual rates", async () => {
    read.mockResolvedValue(page([tx("a", 20), tx("b", 30, 9000)]));
    expect((await run()).rows[0].avg_price_per_gallon).toBe(3.8);
  });
  it("reads beyond the old silent 50,000-row ceiling", async () => {
    const total = 50401;
    read.mockImplementation(async (_company, params) => {
      const offset = params?.offset ?? 0;
      return page(Array.from({ length: Math.min(200, total - offset) }, (_, i) => tx(String(offset + i), 1, 100)), total, offset + 200 < total);
    });
    expect((await run()).fill_count).toBe(total);
  });
  it("refuses a duplicated page instead of double counting", async () => {
    read.mockResolvedValueOnce(page([tx("a", 20)], 2, true)).mockResolvedValueOnce(page([tx("a", 20)], 2));
    await expect(run()).rejects.toThrow(/changed|duplicate/i);
  });
  it("refuses a partial terminal page", async () => {
    read.mockResolvedValue(page([tx("a", 20)], 2));
    await expect(run()).rejects.toThrow(/incomplete/i);
  });
  it("refuses an empty continuing page", async () => {
    read.mockResolvedValue(page([], 2, true));
    await expect(run()).rejects.toThrow(/incomplete/i);
  });
  it("refuses a population that changes while paging", async () => {
    read.mockResolvedValueOnce(page([tx("a", 20)], 2, true)).mockResolvedValueOnce(page([tx("b", 20)], 3));
    await expect(run()).rejects.toThrow(/changed/i);
  });
  it("accepts a genuinely empty population and preserves read scope", async () => {
    read.mockResolvedValue(page([]));
    expect((await run()).fill_count).toBe(0);
    expect(read).toHaveBeenCalledWith("test-company", { from: "2026-11-01", to: "2026-11-30", limit: 200, offset: 0, include_voided: false });
  });
});
