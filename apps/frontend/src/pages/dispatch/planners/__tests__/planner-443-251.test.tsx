// @vitest-environment jsdom
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlannerGrid, clampDayIndex } from "../PlannerGrid";
import { plannerPresetRange, visiblePlannerDays } from "../planner-range";

expect.extend(jestDomMatchers);

// LEAD 443.251 (owner 10-22): "if i only select certain days, the rest of the days should not be empty, those
// columns need to move" · range in a filter · resizable columns · bars that run past the range say so.
describe("planners — only the selected days are drawn (item 5)", () => {
  const week = { start: "2026-10-19", end: "2026-10-25" }; // Mon → Sun

  it("hiding Sa + Su removes those days from the drawn set (fail-old: every day was always drawn)", () => {
    expect(visiblePlannerDays(week, [6, 0])).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
  });

  it("hiding every day never yields an empty board", () => {
    expect(visiblePlannerDays(week, [0, 1, 2, 3, 4, 5, 6])).toHaveLength(7);
  });

  it("a bar edge on a hidden day snaps to the nearest drawn day on its own side", () => {
    const days = visiblePlannerDays(week, [6, 0]);
    expect(clampDayIndex(days, "2026-10-25", "end")).toBe(4); // Sunday end → Friday
    const midHidden = ["2026-10-20", "2026-10-22"]; // Wed hidden
    expect(clampDayIndex(midHidden, "2026-10-21", "start")).toBe(1); // start moves forward
    expect(clampDayIndex(midHidden, "2026-10-21", "end")).toBe(0); // end moves back
  });
});

describe("planners — Filters presets from the company date (item 4)", () => {
  it("Today / This week (Mon–Sun) / Next 7 days / 14 days", () => {
    expect(plannerPresetRange("today", "2026-10-22")).toEqual({ start: "2026-10-22", end: "2026-10-22" });
    expect(plannerPresetRange("this_week", "2026-10-22")).toEqual({ start: "2026-10-19", end: "2026-10-25" });
    expect(plannerPresetRange("next_7", "2026-10-22")).toEqual({ start: "2026-10-22", end: "2026-10-28" });
    expect(plannerPresetRange("next_14", "2026-10-22")).toEqual({ start: "2026-10-22", end: "2026-11-04" });
  });
});

describe("PlannerGrid — continues / started markers, hour ticks, resizable columns (items 5–7)", () => {
  const days = ["2026-10-20", "2026-10-21", "2026-10-22"];
  const row = {
    id: "u1",
    name: "Jorge Luis Infante Corona",
    sortKey: "Jorge Luis Infante Corona",
    bars: [{ id: "b1", loadId: "L1", label: "13693", startYmd: "2026-10-16", endYmd: "2026-10-26", kind: "nb" as const }],
  };

  it("a bar cut on both sides says '← started 10-16' and 'continues →'", () => {
    cleanup();
    render(<PlannerGrid days={days} frozenLabel="Driver" rows={[row]} empty="none" testId="t251" />);
    expect(screen.getByTestId("planner-bar-started")).toHaveTextContent("← started 10-16");
    expect(screen.getByTestId("planner-bar-continues")).toHaveTextContent("continues →");
  });

  it("draws hour ticks at 6 / 12 / 18 in every drawn day", () => {
    cleanup();
    render(<PlannerGrid days={days} frozenLabel="Driver" rows={[row]} empty="none" testId="t251" />);
    expect(screen.getAllByTestId("planner-hour-tick")).toHaveLength(days.length * 3);
  });

  it("the name column has a resize handle and the full name on hover", () => {
    cleanup();
    render(<PlannerGrid days={days} frozenLabel="Driver" rows={[row]} empty="none" testId="t251" />);
    expect(screen.getByTestId("planner-col-resize-name")).toBeInTheDocument();
    expect(document.querySelector(".pg-col-name")?.getAttribute("title")).toBe("Jorge Luis Infante Corona");
  });
});
