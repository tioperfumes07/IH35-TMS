import { describe, expect, it } from "vitest";
import { classifyPmScheduleStatus } from "../pm-schedule.routes.js";

const miles = { interval_kind: "miles" as const, interval_value: 25000, last_service_odometer: 100000, next_due_odometer: 125000, last_service_date: null };
const today = "2026-11-11";
describe("PM schedule list uses current readings and the canonical interval basis", () => {
  it("compares the actual current odometer to next due, independently of last service", () => {
    expect(classifyPmScheduleStatus(miles, 126000, today).status).toBe("overdue");
    expect(classifyPmScheduleStatus(miles, 124600, today).status).toBe("due_soon");
    expect(classifyPmScheduleStatus(miles, 110000, today).status).toBe("current");
    expect(classifyPmScheduleStatus(miles, 125000, today).status).toBe("overdue");
  });
  it("retains unknown for absent baseline or absent current reading", () => {
    expect(classifyPmScheduleStatus(miles, null, today).status).toBe("unknown");
    expect(classifyPmScheduleStatus({ ...miles, last_service_odometer: null, next_due_odometer: null }, 126000, today).status).toBe("unknown");
    expect(classifyPmScheduleStatus({ ...miles, last_service_odometer: 0, next_due_odometer: null }, 126000, today).status).toBe("unknown");
  });
  it("evaluates days from service date, regardless of odometer fields", () => {
    const days = { ...miles, interval_kind: "days" as const, interval_value: 30, last_service_date: "2026-10-01" };
    expect(classifyPmScheduleStatus(days, null, today).status).toBe("overdue");
    expect(classifyPmScheduleStatus({ ...days, last_service_date: "2026-10-20" }, null, today).status).toBe("due_soon");
    expect(classifyPmScheduleStatus({ ...days, last_service_date: "2026-11-10" }, null, today).status).toBe("current");
    expect(classifyPmScheduleStatus({ ...days, last_service_date: null }, 126000, today).status).toBe("unknown");
  });
  it("does not price hours as miles when no canonical engine-hour source exists", () => {
    expect(classifyPmScheduleStatus({ ...miles, interval_kind: "hours" }, 126000, today)).toMatchObject({ status: "unknown", status_reason: expect.stringContaining("no engine-hour source") });
  });
});
