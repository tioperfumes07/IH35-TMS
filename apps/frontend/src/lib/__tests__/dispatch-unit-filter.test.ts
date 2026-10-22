import { describe, expect, it } from "vitest";
import { filterDispatchUnits } from "../dispatch-unit-filter";

describe("dispatch roster unit deep-link", () => {
  const rows = [{ id: "a" }, { id: "b" }];
  it("retains the whole roster without a selected unit", () => {
    expect(filterDispatchUnits(rows)).toBe(rows);
    expect(filterDispatchUnits(rows, null)).toBe(rows);
  });
  it("retains exactly the selected unit and never falls back for an unknown id", () => {
    expect(filterDispatchUnits(rows, "b")).toEqual([rows[1]]);
    expect(filterDispatchUnits(rows, "unknown")).toEqual([]);
  });
  it("filters in-shop and truck-line records by unit_id, not their document id", () => {
    const records = [{ id: "work-order", unit_id: "a" }, { id: "a", unit_id: "b" }, { unit_id: null }];
    expect(filterDispatchUnits(records, "a", "unit_id")).toEqual([records[0]]);
    expect(filterDispatchUnits(records, "missing", "unit_id")).toEqual([]);
  });
});
