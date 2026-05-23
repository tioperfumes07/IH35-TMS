import { describe, expect, it } from "vitest";
import { computeHosClocks, type HosDutyStatusEvent } from "../hos-clocks.service.js";

describe("HOS violation detection", () => {
  it("flags warning and violation thresholds", () => {
    const warningEvents: HosDutyStatusEvent[] = [
      { duty_status: "off_duty", started_at: "2026-05-21T00:00:00.000Z", ended_at: "2026-05-21T10:00:00.000Z" },
      { duty_status: "driving", started_at: "2026-05-21T10:00:00.000Z", ended_at: "2026-05-21T18:30:00.000Z" },
      { duty_status: "on_duty_not_driving", started_at: "2026-05-21T18:30:00.000Z", ended_at: "2026-05-21T19:00:00.000Z" },
      { duty_status: "driving", started_at: "2026-05-21T19:00:00.000Z", ended_at: null },
    ];
    const warning = computeHosClocks(warningEvents, new Date("2026-05-21T21:00:00.000Z"));
    expect(warning.drive_remaining_min).toBe(30);
    expect(warning.status).toBe("warning_1hr");

    const violation = computeHosClocks(warningEvents, new Date("2026-05-21T21:45:00.000Z"));
    expect(violation.drive_remaining_min).toBe(0);
    expect(violation.status).toBe("violation");
  });
});
