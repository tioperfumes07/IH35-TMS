/**
 * ROUND 443.231 — Unassigned units headers must reorder rows.
 * FAIL-OLD: location column has no sortValue → every value "[object Object]" → no-op.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { UnitsWithoutLoad } from "../../../api/dispatch";
import { UnitsWithoutLoadTable } from "./UnitsWithoutLoadTable";

function unit(partial: Partial<UnitsWithoutLoad> & Pick<UnitsWithoutLoad, "id" | "unit_number">): UnitsWithoutLoad {
  return {
    trailer_id: null,
    trailer_number: null,
    driver_id: null,
    driver_name: null,
    last_drop_at: null,
    last_delivered_load_id: null,
    last_delivered_load_number: null,
    hours_since_last_delivery: null,
    location: null,
    ...partial,
  };
}

/** Reverse of natural unit order and of location / last_drop / driver labels. */
const ROWS: UnitsWithoutLoad[] = [
  unit({
    id: "u3",
    unit_number: "T30",
    trailer_number: "TR-30",
    driver_id: "d3",
    driver_name: "Zed Driver",
    location: {
      city: "Dallas",
      state: "TX",
      formatted: "Dallas, TX",
      lat: 32.7,
      lng: -96.8,
      captured_at_utc: "2026-10-20T15:00:00.000Z",
      captured_at_ct: "10:00 CT",
      minutes_ago: 5,
      stale: false,
    },
    last_drop_at: "2026-10-20T12:00:00.000Z",
    hours_since_last_delivery: 48,
  }),
  unit({
    id: "u2",
    unit_number: "T20",
    trailer_number: "TR-20",
    driver_id: "d2",
    driver_name: "Mike Driver",
    location: {
      city: "Austin",
      state: "TX",
      formatted: "Austin, TX",
      lat: 30.2,
      lng: -97.7,
      captured_at_utc: "2026-10-20T15:00:00.000Z",
      captured_at_ct: "10:00 CT",
      minutes_ago: 5,
      stale: false,
    },
    last_drop_at: "2026-10-15T12:00:00.000Z",
    hours_since_last_delivery: 24,
  }),
  unit({
    id: "u1",
    unit_number: "T9",
    trailer_number: "TR-09",
    driver_id: "d1",
    driver_name: "Amy Driver",
    location: null,
    last_drop_at: null,
    hours_since_last_delivery: null,
  }),
];

function unitOrder(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((tr) => {
      const text = tr.textContent ?? "";
      const m = text.match(/T\d+/);
      return m?.[0] ?? text.slice(0, 8);
    });
}

describe("UnitsWithoutLoadTable sort (443.231)", () => {
  it("Unit / Current Location / Last Drop / Driver headers reorder asc then desc; null location last", () => {
    render(
      <MemoryRouter>
        <UnitsWithoutLoadTable rows={ROWS} onRowClick={() => {}} />
      </MemoryRouter>,
    );

    expect(unitOrder()).toEqual(["T30", "T20", "T9"]);

    // Unit natural: T9, T20, T30
    fireEvent.click(screen.getByRole("button", { name: /^Unit/ }));
    expect(unitOrder()).toEqual(["T9", "T20", "T30"]);
    fireEvent.click(screen.getByRole("button", { name: /^Unit/ }));
    expect(unitOrder()).toEqual(["T30", "T20", "T9"]);
    // clear to default
    fireEvent.click(screen.getByRole("button", { name: /^Unit/ }));

    // Location asc: Austin, Dallas, null(last) → T20, T30, T9
    fireEvent.click(screen.getByRole("button", { name: /^Current Location/ }));
    expect(unitOrder()).toEqual(["T20", "T30", "T9"]);
    // Location desc: Dallas, Austin, null(still last) → T30, T20, T9
    fireEvent.click(screen.getByRole("button", { name: /^Current Location/ }));
    expect(unitOrder()).toEqual(["T30", "T20", "T9"]);
    fireEvent.click(screen.getByRole("button", { name: /^Current Location/ }));

    // Last Drop asc: Oct 15, Oct 20, null → T20, T30, T9
    fireEvent.click(screen.getByRole("button", { name: /^Last Drop/ }));
    expect(unitOrder()).toEqual(["T20", "T30", "T9"]);
    fireEvent.click(screen.getByRole("button", { name: /^Last Drop/ }));
    expect(unitOrder()).toEqual(["T30", "T20", "T9"]);
    fireEvent.click(screen.getByRole("button", { name: /^Last Drop/ }));

    // Driver asc by displayed name: Amy, Mike, Zed → T9, T20, T30
    fireEvent.click(screen.getByRole("button", { name: /^Driver/ }));
    expect(unitOrder()).toEqual(["T9", "T20", "T30"]);
    fireEvent.click(screen.getByRole("button", { name: /^Driver/ }));
    expect(unitOrder()).toEqual(["T30", "T20", "T9"]);
  });
});
