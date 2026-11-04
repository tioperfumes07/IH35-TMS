/**
 * ACCT-F11062 (live check 11-03): row 167 calendar dates, the "2001" Period, row 203 no-settlement words,
 * and the Diesel-by-truck page size.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatCalendarDateUS, formatDateUS } from "../formatDate";
import { fuelQuestionSettlementLabel, noSettlementLabel } from "../no-settlement-label";

describe("ROW 167 — calendar dates never shift a day", () => {
  it('"2029-09-22T00:00:00.000Z" (CDL expiry) shows 09/22/2029, not 09/21/2029', () => {
    expect(formatCalendarDateUS("2029-09-22T00:00:00.000Z")).toBe("09/22/2029");
    expect(formatDateUS("2029-09-22T00:00:00.000Z", { dateOnly: true })).toBe("09/22/2029");
    // the old path, kept for instants: midnight UTC is 7 PM the previous day in Central
    expect(formatDateUS("2029-09-22T00:00:00.000Z")).toBe("09/21/2029");
  });
  it("bare dates, Dates and blanks", () => {
    expect(formatCalendarDateUS("2029-09-22")).toBe("09/22/2029");
    expect(formatCalendarDateUS(new Date(Date.UTC(2029, 8, 22)))).toBe("09/22/2029");
    expect(formatCalendarDateUS(null)).toBe("");
    expect(formatCalendarDateUS("")).toBe("");
  });
});

describe('Driver settlements Period — a year-less string is never "2001"', () => {
  it('"Wed Oct 21" (String(Date).slice(0,10)) renders blank, not 10/21/2001', () => {
    expect(formatDateUS("Wed Oct 21")).toBe("");
    expect(formatDateUS("2026-10-21")).toBe("10/21/2026");
  });
});

describe("ROW 203 — no settlement says why in words", () => {
  it("an unsettled driver bill (13544 / 13563) names the bill", () => {
    expect(noSettlementLabel({ unsettled_driver_bill_id: "ec500f62", unsettled_driver_bill_number: "13544" })).toBe("Not settled · bill 13544");
  });
  it("a salaried load and a load with nothing", () => {
    expect(noSettlementLabel({ salaried_load: true })).toBe("Salaried · no settlement");
    expect(noSettlementLabel({})).toBe("No settlement");
    for (const f of [{}, { salaried_load: true }, { unsettled_driver_bill_id: "x" }]) expect(noSettlementLabel(f)).not.toMatch(/^[—-]$/);
  });
  it("Fuel questions: live number, else words", () => {
    expect(fuelQuestionSettlementLabel({ proposed_settlement_ref: "5851", proposed_load_id: "l" })).toBe("5851");
    expect(fuelQuestionSettlementLabel({ proposed_settlement_ref: null, proposed_load_id: "l" })).toBe("Not settled");
    expect(fuelQuestionSettlementLabel({ proposed_settlement_ref: null, proposed_load_id: null })).toBe("No load");
  });
});

const getFuelTransactions = vi.fn();
vi.mock("../../api/fuelPlanner", async (orig) => ({ ...(await orig<typeof import("../../api/fuelPlanner")>()), getFuelTransactions: (...a: unknown[]) => getFuelTransactions(...a) }));

describe("Diesel by truck pages within the API's 200 cap (live: limit=500 -> HTTP 400)", () => {
  afterEach(() => getFuelTransactions.mockReset());
  it("never asks for more than 200 and pages until has_more is false", async () => {
    getFuelTransactions
      .mockResolvedValueOnce({ transactions: [], has_more: true, total: 350 })
      .mockResolvedValueOnce({ transactions: [], has_more: false, total: 350 });
    const { fetchDieselByTruckAggregate } = await import("../../pages/fuel/fuelDieselByTruck");
    await fetchDieselByTruckAggregate("co", "2026-10-01", "2026-10-31");
    expect(getFuelTransactions).toHaveBeenCalledTimes(2);
    for (const call of getFuelTransactions.mock.calls) expect(call[1].limit).toBeLessThanOrEqual(200);
    expect(getFuelTransactions.mock.calls[1][1].offset).toBe(200);
  });
});
