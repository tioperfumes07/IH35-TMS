// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PlannerGrid } from "./PlannerGrid";

describe("PlannerGrid", () => {
  it("paints a single track with repeating day rules and labelled dwell, no Available cells", () => {
    render(
      <PlannerGrid
        days={["2026-08-22", "2026-08-23"]}
        frozenLabel="Unit"
        rows={[
          {
            id: "u1",
            name: "T171",
            bars: [{ id: "l1", label: "L-1", startYmd: "2026-08-22", endYmd: "2026-08-23", kind: "nb" }],
            dwells: [{ id: "d1", startYmd: "2026-08-23", endYmd: "2026-08-23", label: "3d 20h idle" }],
          },
        ]}
        empty="none"
      />
    );
    const track = screen.getByTestId("planner-grid-track");
    expect(track.style.backgroundImage).toContain("repeating-linear-gradient");
    expect(screen.getByTestId("planner-grid-dwell").textContent).toContain("3d 20h idle");
    expect(screen.queryByText("Available")).toBeNull();
    expect(screen.getByText("L-1")).toBeTruthy();
    expect(document.querySelectorAll('[data-load-id="l1"]').length).toBe(1);
  });

  it("A4: a 17-day load is one element, not N day segments", () => {
    cleanup();
    const days = Array.from({ length: 17 }, (_, i) => `2026-08-${String(i + 8).padStart(2, "0")}`);
    render(
      <PlannerGrid
        days={days}
        frozenLabel="Unit"
        rows={[
          {
            id: "u1",
            name: "T163",
            bars: [
              {
                id: "load-17d",
                loadId: "load-17d",
                label: "L-17",
                startYmd: days[0],
                endYmd: days[16],
                kind: "nb",
              },
            ],
          },
        ]}
        empty="none"
      />
    );
    expect(document.querySelectorAll('[data-load-id="load-17d"]').length).toBe(1);
  });
});
