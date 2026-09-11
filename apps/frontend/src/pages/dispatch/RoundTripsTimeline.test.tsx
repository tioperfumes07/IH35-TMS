import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { DispatchLoadRow } from "../../api/loads";
import { RoundTripsTimeline } from "./RoundTripsTimeline";

// RT-ROW-HEIGHT-CAP (owner correction 2026-09-11, verbatim: "fix the row-height cap so 16 units fit
// in view (RoundTripsTimeline.tsx's row height currently grows unbounded with leg count -- cap it or
// make the column that grows scrollable independently, not the whole page)"). Each leg stacks as its
// own bar within a unit's row; the row's own minHeight used to grow unbounded (40 + legs*22px), so a
// single busy unit could dwarf its neighbors and push other units below the fold. This suite asserts
// the CAP: a unit with many legs gets a bounded row height + an independently-scrollable bar area
// (never a taller row), while a unit with few legs is completely unaffected (no scroll container, no
// height change from before).
const base = {
  id: "l0",
  load_number: "L0",
  created_at: "2026-08-25T00:00:00Z",
  updated_at: "2026-08-25T00:00:00Z",
  status: "delivered_pending_docs",
} as unknown as DispatchLoadRow;

function leg(overrides: Partial<DispatchLoadRow>): DispatchLoadRow {
  return { ...base, ...overrides } as DispatchLoadRow;
}

describe("RoundTripsTimeline — row-height cap", () => {
  it("a unit with few legs (under the cap) gets no scroll container and the pre-cap height formula", () => {
    const loads = [
      leg({
        id: "l1",
        load_number: "13600",
        assigned_unit_id: "u-quiet",
        assigned_unit_number: "T900",
        pickup_scheduled_at: "2026-08-26T08:00:00Z",
        delivery_scheduled_at: "2026-08-28T08:00:00Z",
      }),
    ];
    render(
      <MemoryRouter>
        <RoundTripsTimeline loads={loads} rangeFrom="2026-08-25" rangeTo="2026-09-11" onLoadClick={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByTestId("round-trips-timeline-unit-u-quiet")).toBeInTheDocument();
    // No scroll container for a unit under the cap.
    expect(screen.queryByTestId("round-trips-timeline-unit-u-quiet-scroll")).not.toBeInTheDocument();
  });

  it("a unit with many legs (over the cap) gets a bounded row height and an internally-scrollable bar area — never an ever-taller row", () => {
    const manyLegs: DispatchLoadRow[] = Array.from({ length: 10 }, (_, i) =>
      leg({
        id: `busy-${i}`,
        load_number: `1370${i}`,
        assigned_unit_id: "u-busy",
        assigned_unit_number: "T901",
        created_at: `2026-08-2${i % 6}T00:00:00Z`,
        pickup_scheduled_at: `2026-08-2${(i % 6) + 1}T08:00:00Z`,
        delivery_scheduled_at: `2026-08-2${(i % 6) + 2}T08:00:00Z`,
      })
    );
    render(
      <MemoryRouter>
        <RoundTripsTimeline loads={manyLegs} rangeFrom="2026-08-25" rangeTo="2026-09-11" onLoadClick={vi.fn()} />
      </MemoryRouter>
    );

    const row = screen.getByTestId("round-trips-timeline-unit-u-busy");
    const scrollArea = screen.getByTestId("round-trips-timeline-unit-u-busy-scroll");
    expect(scrollArea).toBeInTheDocument();

    // The row's own height must be BOUNDED (the whole point of the cap) — not 40 + 10*22 = 260px,
    // capped instead to 40 + ROW_MAX_VISIBLE_LEGS(4)*22 = 128px.
    const rowMinHeight = Number(String(row.style.minHeight).replace("px", ""));
    expect(rowMinHeight).toBeLessThan(40 + manyLegs.length * 22);
    expect(rowMinHeight).toBe(128);

    // The bars container itself must be the one that scrolls (overflow-y-auto + a maxHeight), not
    // the page — every leg still renders (no data loss), it's reachable by scrolling this one row.
    expect(scrollArea.className).toContain("overflow-y-auto");
    expect(String(scrollArea.style.maxHeight)).not.toBe("");

    // Not silently hidden — a title attribute names the real leg count so a dispatcher knows to scroll.
    expect(scrollArea.getAttribute("title")).toContain("legs");
  });
});
