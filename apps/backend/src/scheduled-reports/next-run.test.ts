import { describe, expect, it } from "vitest";
import { computeNextRunAt, scheduleInputFromDbRow } from "./next-run.js";

describe("scheduled reports scheduling helpers", () => {
  it("computes next daily run after now when today's slot passed", () => {
    const from = new Date("2026-01-15T18:00:00.000Z");
    const next = computeNextRunAt(
      {
        frequency: "daily",
        run_time: "06:00",
        run_day_of_week: null,
        run_day_of_month: null,
        cron_expression: null,
        timezone: "America/Chicago",
      },
      from
    );
    expect(next).not.toBeNull();
    if (!next) return;
    expect(next.getTime()).toBeGreaterThan(from.getTime());
  });

  it("maps db rows into schedule inputs", () => {
    const input = scheduleInputFromDbRow({
      frequency: "weekly",
      run_time: "07:30:00",
      run_day_of_week: 1,
      run_day_of_month: null,
      cron_expression: null,
      timezone: "America/Chicago",
    });
    expect(input.frequency).toBe("weekly");
    expect(input.run_time).toBe("07:30");
  });
});
