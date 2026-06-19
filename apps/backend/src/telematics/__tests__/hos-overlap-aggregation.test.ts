import { describe, expect, it } from "vitest";
import { flattenDutySegments, computeHosClocks } from "../hos-clocks.service.js";
import { getHosDaily } from "../hos-tracker.service.js";

const OCI = "11111111-1111-4111-8111-111111111111";
const DRIVER = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-06-19T20:00:00.000Z");

// GUARD: on_duty_min was SUMMING overlapping/duplicate/open-ended segments (CAZARES 06-14 = 35h in 24h) ->
// 8-day sum clamped cycle_remaining to 0 -> FALSE violation. The flattener must union to wall-clock.
describe("flattenDutySegments (no double-count)", () => {
  it("collapses overlapping same-window segments to wall-clock, not the sum of durations", () => {
    // Three overlapping on-duty segments all inside 13:00-18:00 (5h wall-clock). Naive sum would be ~13h.
    const flat = flattenDutySegments(
      [
        { started_at: "2026-06-19T13:00:00.000Z", ended_at: "2026-06-19T18:00:00.000Z", duty_status: "driving" },
        { started_at: "2026-06-19T13:00:00.000Z", ended_at: "2026-06-19T17:00:00.000Z", duty_status: "on_duty_not_driving" },
        { started_at: "2026-06-19T14:00:00.000Z", ended_at: "2026-06-19T18:00:00.000Z", duty_status: "driving" },
      ],
      NOW
    );
    const total = flat.reduce((m, s) => m + (s.end.getTime() - s.start.getTime()) / 60000, 0);
    expect(total).toBeLessThanOrEqual(5 * 60); // <= 5h wall-clock, never the ~13h naive sum
  });

  it("clips an open-ended (never-logged-out) segment to the next segment's start", () => {
    const flat = flattenDutySegments(
      [
        { started_at: "2026-06-19T10:00:00.000Z", ended_at: null, duty_status: "driving" }, // open
        { started_at: "2026-06-19T12:00:00.000Z", ended_at: "2026-06-19T13:00:00.000Z", duty_status: "off_duty" },
      ],
      NOW
    );
    const driving = flat.find((s) => s.duty_status === "driving")!;
    expect((driving.end.getTime() - driving.start.getTime()) / 60000).toBe(120); // 10:00->12:00, not ->20:00
  });
});

describe("getHosDaily 8-day breakdown sanity", () => {
  it("never reports a day > 1440 min even with overlapping events", async () => {
    // Heavily overlapping driving across the day; the breakdown day must stay <= 1440.
    const events = [
      { started_at: "2026-06-18T20:00:00.000Z", ended_at: "2026-06-19T13:00:00.000Z", duty_status: "off_duty" },
      { started_at: "2026-06-19T05:00:00.000Z", ended_at: "2026-06-19T20:00:00.000Z", duty_status: "driving" },
      { started_at: "2026-06-19T06:00:00.000Z", ended_at: "2026-06-19T19:00:00.000Z", duty_status: "on_duty_not_driving" },
    ];
    const client = {
      query: async (sql: string) => {
        if (sql.includes("set_config")) return { rows: [] };
        if (sql.includes("FROM hos.duty_status_events")) return { rows: events };
        return { rows: [] };
      },
    };
    const daily = await getHosDaily(client, OCI, DRIVER, "2026-06-19", NOW);
    for (const d of daily.eight_day_breakdown) expect(d.on_duty_min).toBeLessThanOrEqual(1440);
  });
});

describe("computeHosClocks cycle no longer over-counts", () => {
  it("does not clamp cycle to 0 from overlapping on-duty segments", () => {
    // ~5h of real on-duty (overlapping) over 8 days -> cycle nowhere near exhausted.
    const c = computeHosClocks(
      [
        { started_at: "2026-06-15T13:00:00.000Z", ended_at: "2026-06-15T18:00:00.000Z", duty_status: "driving" },
        { started_at: "2026-06-15T13:00:00.000Z", ended_at: "2026-06-15T18:00:00.000Z", duty_status: "on_duty_not_driving" },
      ],
      NOW
    );
    expect(c.cycle_remaining_min).toBeGreaterThan(60 * 60); // well above 0 (not a false violation)
  });
});
