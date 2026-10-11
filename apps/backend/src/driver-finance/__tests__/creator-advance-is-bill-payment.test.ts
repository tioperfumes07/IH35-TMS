import { describe, expect, it } from "vitest";
import { advanceEconomicRouting } from "../../cash-advances/cash-advance-create.js";
import { loadNumberOnAdvanceDay } from "../settlement-creator.service.js";

// OWNER 9:44 / 9:46 PM CT 2026-10-10: "A CASH ADVANCE IS A BILL PAYMENT TO THAT LOAD" — the bill of the load the driver was
// on the day of the advance (B5 linked_driver_bill_id, the existing design), recovered by the settlement.

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const loads5775 = [
  { load_number: "13506", pickup_date: "2026-08-04", delivery_date: "2026-08-07" },
  { load_number: "13514", pickup_date: "2026-08-10", delivery_date: "2026-08-12" },
  { load_number: "13516", pickup_date: "2026-08-13", delivery_date: "2026-08-14" },
];

describe("Creator advance = bill payment on its load", () => {
  it("5775's 2026-08-05 advance belongs to load 13506 (the driver's load that day), not 13516 from the row", () => {
    expect(loadNumberOnAdvanceDay(loads5775, "2026-08-05")).toBe("13506");
  });
  it("a day between loads or no date -> null (the row's own load is used)", () => {
    expect(loadNumberOnAdvanceDay(loads5775, "2026-08-08")).toBeNull();
    expect(loadNumberOnAdvanceDay(loads5775, null)).toBeNull();
  });
  it("an advance linked to a driver bill is driver debt the settlement recovers — even in USMCA", () => {
    expect(advanceEconomicRouting({ purpose: "other", linked_driver_bill_id: "bill-1" }, USMCA)).toBe("driver_settlement");
  });
  it("an advance NOT linked to a bill keeps the USMCA load_expense rule (LST-F25011)", () => {
    expect(advanceEconomicRouting({ purpose: "other", linked_driver_bill_id: null }, USMCA)).toBe("load_expense");
  });
});
