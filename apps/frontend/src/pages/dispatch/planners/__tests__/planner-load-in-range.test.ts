import { describe, expect, it } from "vitest";
import { plannerLoadInRange, plannerLoadSpan } from "../planner-bars";

const load = (p: string | null, d: string | null) => ({ pickup_scheduled_at: p, delivery_scheduled_at: d, scheduled_delivery_date: null });

describe("LEAD 443.249 — a board load is on the planner when its span overlaps the range", () => {
  it("picked up before the range and delivered after it (13690 shape) stays on the planner", () => {
    expect(plannerLoadInRange(load("2026-10-14T13:00:00Z", "2026-10-26T13:00:00Z"), "2026-10-16", "2026-10-22")).toBe(true);
  });
  it("picked up in the range, delivered after it", () => {
    expect(plannerLoadInRange(load("2026-10-20T13:00:00Z", "2026-10-23T11:00:00Z"), "2026-10-16", "2026-10-22")).toBe(true);
  });
  it("entirely after the range is not on this week's planner", () => {
    expect(plannerLoadInRange(load("2026-10-24T13:00:00Z", "2026-10-26T13:00:00Z"), "2026-10-16", "2026-10-22")).toBe(false);
  });
  it("a board load with no planned date is never dropped", () => {
    expect(plannerLoadInRange(load(null, null), "2026-10-16", "2026-10-22")).toBe(true);
  });
  it("span: a missing delivery ends on the pickup day", () => {
    expect(plannerLoadSpan(load("2026-10-20T13:00:00Z", null))).toEqual({ start: "2026-10-20", end: "2026-10-20" });
  });
});
