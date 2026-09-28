/**
 * Unit tests — ROUND 155.6 Truck Line group-by-unit uniqueness + tour stacking.
 */
import { describe, expect, it } from "vitest";
import { findDuplicateTopLevelUnitIds, groupTruckLineByUnit } from "../group-by-unit.js";

describe("groupTruckLineByUnit", () => {
  it("stacks tour legs under one top-level unit and never duplicates unit_id", () => {
    const groups = groupTruckLineByUnit(
      [
        {
          unit_id: "u1",
          unit_number: "T156",
          load_id: "l-nb",
          trip_type: "NB",
          tour_id: "tour-1",
          tour_display_id: "P-0009",
          created_at: "2026-09-20",
          row: { load: "nb" },
        },
        {
          unit_id: "u1",
          unit_number: "T156",
          load_id: "l-sb",
          trip_type: "SB",
          tour_id: "tour-1",
          tour_display_id: "P-0009",
          created_at: "2026-09-22",
          row: { load: "sb" },
        },
        {
          unit_id: "u2",
          unit_number: "T168",
          load_id: "l-solo",
          trip_type: "NB",
          tour_id: null,
          tour_display_id: null,
          created_at: "2026-09-21",
          row: { load: "solo" },
        },
      ],
      [{ unit_id: "u3", unit_number: "T170", row: { kind: "available" } }]
    );

    expect(findDuplicateTopLevelUnitIds(groups)).toEqual([]);
    expect(groups.map((g) => g.section)).toEqual(["tour", "in_transit", "available"]);
    expect(groups[0].unit_id).toBe("u1");
    expect(groups[0].tour_display_id).toBe("P-0009");
    expect(groups[0].legs).toHaveLength(2);
    expect(groups[0].legs.map((l) => (l as { load: string }).load)).toEqual(["nb", "sb"]);
    expect(groups[1].section).toBe("in_transit");
    expect(groups[2].section).toBe("available");
  });

  it("never surfaces a UUID as tour_display_id", () => {
    const groups = groupTruckLineByUnit(
      [
        {
          unit_id: "u1",
          unit_number: "T156",
          load_id: "l1",
          trip_type: "NB",
          tour_id: "1b6344b1-1026-458f-a8c1-eb63d173b6fa",
          tour_display_id: "1b6344b1-1026-458f-a8c1-eb63d173b6fa",
          created_at: "2026-09-20",
          row: { load: "nb" },
        },
      ],
      []
    );
    expect(groups[0].tour_display_id).toBeNull();
  });

  it("throws when a caller forces duplicate top-level unit_ids", () => {
    expect(findDuplicateTopLevelUnitIds([{ unit_id: "a" }, { unit_id: "a" }])).toEqual(["a"]);
  });
});
