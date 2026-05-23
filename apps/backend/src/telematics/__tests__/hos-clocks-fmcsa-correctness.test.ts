import { describe, expect, it } from "vitest";
import { computeHosClocks, type HosDutyStatusEvent } from "../hos-clocks.service.js";

describe("HOS clocks FMCSA correctness", () => {
  it("computes 11/14/8 and 70-hour clocks from duty events", () => {
    const events: HosDutyStatusEvent[] = [
      {
        duty_status: "off_duty",
        started_at: "2026-05-20T00:00:00.000Z",
        ended_at: "2026-05-20T10:00:00.000Z",
      },
      {
        duty_status: "driving",
        started_at: "2026-05-20T10:00:00.000Z",
        ended_at: "2026-05-20T15:00:00.000Z",
      },
      {
        duty_status: "on_duty_not_driving",
        started_at: "2026-05-20T15:00:00.000Z",
        ended_at: "2026-05-20T17:00:00.000Z",
      },
      {
        duty_status: "driving",
        started_at: "2026-05-20T17:00:00.000Z",
        ended_at: "2026-05-20T19:00:00.000Z",
      },
      {
        duty_status: "on_duty_not_driving",
        started_at: "2026-05-20T19:00:00.000Z",
        ended_at: "2026-05-20T19:30:00.000Z",
      },
      {
        duty_status: "driving",
        started_at: "2026-05-20T19:30:00.000Z",
        ended_at: null,
      },
    ];

    const clocks = computeHosClocks(events, new Date("2026-05-20T20:30:00.000Z"));

    expect(clocks.drive_remaining_min).toBe(180);
    expect(clocks.window_remaining_min).toBe(210);
    expect(clocks.break_remaining_min).toBe(420);
    expect(clocks.cycle_remaining_min).toBe(3570);
    expect(clocks.status).toBe("ok");
    expect(clocks.last_reset_at).toBe("2026-05-20T10:00:00.000Z");
  });
});
