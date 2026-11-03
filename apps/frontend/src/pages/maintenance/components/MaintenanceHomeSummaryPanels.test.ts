import { describe, expect, it } from "vitest";
import { pmStatusForUnit } from "./MaintenanceHomeSummaryPanels";
import type { MaintPmDueRow } from "../../../api/maintenance";

// LEAD 11-03 row 70 (Codex batch40): arriving units show their PM state from the pm-due source; no schedule is said so.
const row = (o: Partial<MaintPmDueRow>): MaintPmDueRow => ({
  id: "s", asset_id: "u1", unit_code: "T152", pm_type: "oil", is_due: false, due_reasons: [], miles_remaining: null,
  days_remaining: null, current_odometer_mi: null, next_due_miles: null, next_due_date: null, ...o,
});

describe("pmStatusForUnit", () => {
  it("a unit with no schedule says so (never 'OK')", () => {
    expect(pmStatusForUnit([row({ asset_id: "other" })], "u1")).toEqual({ text: "No PM schedule", due: false });
  });
  it("due now wins and names every due PM", () => {
    expect(pmStatusForUnit([row({ is_due: true }), row({ pm_type: "dot_inspection", is_due: true }), row({ pm_type: "tires", miles_remaining: 10 })], "u1"))
      .toEqual({ text: "Due: Oil, DOT", due: true });
  });
  it("otherwise the nearest by miles, then days", () => {
    expect(pmStatusForUnit([row({ miles_remaining: 4200.4 }), row({ pm_type: "brake", miles_remaining: 1200 })], "u1").text).toBe("Brake in 1,200 mi");
    expect(pmStatusForUnit([row({ pm_type: "dot_inspection", days_remaining: 12 })], "u1").text).toBe("DOT in 12 d");
  });
  it("an unread PM source is never 'No PM schedule' (Codex batch53)", () => {
    expect(pmStatusForUnit([], "u1", "loading").text).toBe("Checking PM…");
    expect(pmStatusForUnit([], "u1", "error").text).toBe("PM unavailable");
    expect(pmStatusForUnit([], "u1", "ready").text).toBe("No PM schedule");
  });
  it("a schedule with neither miles nor days remaining says it has no reading", () => {
    expect(pmStatusForUnit([row({})], "u1").text).toBe("Schedule has no reading");
  });
});
