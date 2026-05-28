import { describe, expect, it } from "vitest";
import {
  computeNextDueDate,
  computeNextDueMiles,
  evaluatePmDue,
  extractSamsaraOdometerMi,
  recomputePmScheduleDueFields,
} from "../pm-due.shared.js";

describe("maint pm due shared", () => {
  it("computes next due miles and date", () => {
    expect(computeNextDueMiles(100_000, 25_000)).toBe(125_000);
    expect(computeNextDueDate("2026-01-01", 90)).toBe("2026-04-01");
  });

  it("recomputes schedule due fields", () => {
    expect(
      recomputePmScheduleDueFields({
        interval_miles: 25_000,
        interval_days: 90,
        last_done_miles: 80_000,
        last_done_date: "2026-01-15",
      })
    ).toEqual({
      next_due_miles: 105_000,
      next_due_date: "2026-04-15",
    });
  });

  it("extracts odometer from samsara payload variants", () => {
    expect(extractSamsaraOdometerMi({ odometerMiles: 184_250.4 })).toBe(184_250);
    expect(extractSamsaraOdometerMi({ vehicle: { odometer_mi: 190_000 } })).toBe(190_000);
  });

  it("flags due when odometer or date threshold crossed", () => {
    const dueByMiles = evaluatePmDue(
      {
        interval_miles: 25_000,
        interval_days: null,
        last_done_miles: 100_000,
        last_done_date: null,
        next_due_miles: 125_000,
        next_due_date: null,
      },
      126_000,
      "2026-05-01"
    );
    expect(dueByMiles.is_due).toBe(true);
    expect(dueByMiles.due_reasons).toContain("miles");

    const dueByDate = evaluatePmDue(
      {
        interval_miles: null,
        interval_days: 30,
        last_done_miles: null,
        last_done_date: "2026-03-01",
        next_due_miles: null,
        next_due_date: "2026-05-01",
      },
      null,
      "2026-05-28"
    );
    expect(dueByDate.is_due).toBe(true);
    expect(dueByDate.due_reasons).toContain("date");
  });
});
