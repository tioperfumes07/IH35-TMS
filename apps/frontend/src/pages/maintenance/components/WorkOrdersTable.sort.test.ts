import { describe, expect, it } from "vitest";
import { compareWoRows } from "./WorkOrdersTable";
import type { WorkOrder } from "../../../api/maintenance";

// Register row 154 / audit D035 — Load, Driver, Vendor, Bill, JE and Timing sort like every adjacent column.
const wo = (o: Partial<WorkOrder>) => ({ id: "x", ...o }) as WorkOrder;
const order = (rows: WorkOrder[], key: string) => [...rows].sort((a, b) => compareWoRows(a, b, key));

describe("WorkOrdersTable sort (row 154)", () => {
  it("Load sorts by load number, numerically", () => {
    const r = order([wo({ linked_load_number: "13700" }), wo({ linked_load_number: "9800" }), wo({ linked_load_number: "13574" })], "load_id");
    expect(r.map((x) => x.linked_load_number)).toEqual(["9800", "13574", "13700"]);
  });
  it("Driver and Vendor sort by the displayed name", () => {
    expect(order([wo({ driver_name: "Ruben" }), wo({ driver_name: "Angel" })], "driver_id").map((x) => x.driver_name)).toEqual(["Angel", "Ruben"]);
    expect(order([wo({ resolved_vendor_name: "Love's" }), wo({ resolved_vendor_name: "Bridgestone" })], "resolved_vendor_id").map((x) => x.resolved_vendor_name)).toEqual(["Bridgestone", "Love's"]);
  });
  it("Bill sorts by bill number; JE sorts unlinked before linked", () => {
    expect(order([wo({ linked_bill_number: "B-20" }), wo({ linked_bill_number: "B-3" })], "linked_bill_id").map((x) => x.linked_bill_number)).toEqual(["B-3", "B-20"]);
    expect(order([wo({ linked_journal_entry_id: "je" }), wo({ linked_journal_entry_id: null })], "linked_journal_entry_id").map((x) => x.linked_journal_entry_id)).toEqual([null, "je"]);
  });
  it("Timing sorts by the seconds the cell describes", () => {
    const r = order([wo({ duration_seconds: 7200 }), wo({ duration_seconds: 60 }), wo({ duration_seconds: 3600 })], "timing");
    expect(r.map((x) => x.duration_seconds)).toEqual([60, 3600, 7200]);
  });
});
