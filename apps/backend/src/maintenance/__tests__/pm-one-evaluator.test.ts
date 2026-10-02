import { describe, expect, it } from "vitest";
import { pmScheduleBaselineAbsentReason, pmScheduleDueInput } from "../pm-auto-engine.service.js";
import { evaluatePmDue } from "../../maint/pm-due.shared.js";

const days = { interval_kind: "days" as const, interval_value: 90, last_service_odometer: null, next_due_odometer: null };

describe("ROUND 326 M2 — the PM engine judges a PM with the same evaluator as the UI", () => {
  it("a days PM is due by date (no odometer needed) once last_service_date + interval has passed", () => {
    const due = evaluatePmDue(pmScheduleDueInput({ ...days, last_service_date: "2026-06-01" }), null, "2026-10-02");
    expect(due.next_due_date).toBe("2026-08-30");
    expect(due.is_due).toBe(true);
    expect(due.due_reasons).toEqual(["date"]);
    expect(evaluatePmDue(pmScheduleDueInput({ ...days, last_service_date: "2026-09-20" }), null, "2026-10-02").is_due).toBe(false);
  });

  it("a days PM with no last_service_date is honestly unevaluable, never guessed", () => {
    expect(pmScheduleBaselineAbsentReason({ ...days, last_service_date: null })).toMatch(/no last_service_date/);
    expect(pmScheduleBaselineAbsentReason({ ...days, last_service_date: "2026-06-01" })).toBeNull();
  });

  it("a miles PM maps its odometer baseline into the same input", () => {
    const input = pmScheduleDueInput({ interval_kind: "miles", interval_value: 15000, last_service_odometer: 100000, next_due_odometer: 115000, last_service_date: null });
    expect(input).toMatchObject({ interval_miles: 15000, interval_days: null, last_done_miles: 100000, next_due_miles: 115000 });
    expect(evaluatePmDue(input, 116000, "2026-10-02").due_reasons).toEqual(["miles"]);
  });
});
