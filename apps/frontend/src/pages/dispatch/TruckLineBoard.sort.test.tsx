/**
 * ROUND 443.231 — Truck Line group sort + AvailableTruckTrack restore.
 * FAIL-OLD on main 7a24e7e8 (groups only reorder when sort.key === "truck"; available TRANSIT
 * prints "no trip in progress"). PASS on this branch.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TruckLineGroup, TruckLineRow } from "../../api/truckLine";
import { TruckLineBoard } from "./TruckLineBoard";

vi.mock("../../api/truckLine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/truckLine")>();
  return {
    ...actual,
    getTruckLine: vi.fn(),
    listLoadExceptionReasons: vi.fn().mockResolvedValue({ reasons: [] }),
  };
});

vi.mock("../../hooks/useLoadCostRollups", () => ({
  useLoadCostRollups: () => new Map(),
}));

import { getTruckLine } from "../../api/truckLine";

function loadedRow(partial: {
  unit_id: string;
  unit_number: string;
  load_number: string | null;
  tour: string | null;
  pu: string | null;
  del: string | null;
}): TruckLineRow {
  return {
    kind: "loaded",
    unit_id: partial.unit_id,
    unit_number: partial.unit_number,
    tour_display_id: partial.tour,
    load: partial.load_number
      ? {
          load_id: `load-${partial.load_number}`,
          load_number: partial.load_number,
          status: "in_transit",
          trip_type: "NB",
          rate_total_cents: 10000,
          customer_name: "Acme",
          pickup: { city: "Laredo", state: "TX" },
          delivery: { city: "Dallas", state: "TX" },
        }
      : null,
    drivers: [{ id: `drv-${partial.unit_id}`, name: "Driver" }],
    station: {
      reached_index: 3,
      next_index: 5,
      stamps: [],
      has_open_exception: false,
      exception_reason_label: null,
      open_exception_id: null,
    },
    position: null,
    next_appointment: null,
    appointments: {
      pickup: partial.pu ? { at: partial.pu, at_source: "appointment_start_at", late: false } : null,
      delivery: partial.del ? { at: partial.del, at_source: "appointment_start_at", late: false } : null,
    },
  };
}

function availableRow(partial: {
  unit_id: string;
  unit_number: string;
  driver_id: string;
  driving_minutes_remaining: number | null;
}): TruckLineRow {
  return {
    kind: "available",
    unit_id: partial.unit_id,
    unit_number: partial.unit_number,
    tour_display_id: null,
    load: null,
    drivers: [{ id: partial.driver_id, name: "Idle Driver" }],
    station: null,
    position: null,
    next_appointment: null,
    appointments: { pickup: null, delivery: null },
    available: {
      driver_id: partial.driver_id,
      driving_minutes_remaining: partial.driving_minutes_remaining,
      cycle_minutes_remaining: null,
      hos_polled_minutes_ago: 5,
      last_closed_load_number: "9999",
      parked_city: "Laredo",
      parked_state: "TX",
    },
  };
}

/** Unit order T10, T20, T30 — intentionally DIFFERENT from load 300/100/200, tour P-0100/P-0050/P-0200,
 * PU Oct 20 / Oct 10 / null, DEL Oct 22 / Oct 12 / Oct 25. */
function fixtureGroups(): TruckLineGroup[] {
  return [
    {
      section: "in_transit",
      unit_id: "u-t10",
      unit_number: "T10",
      tour_display_id: "P-0100",
      legs: [
        loadedRow({
          unit_id: "u-t10",
          unit_number: "T10",
          load_number: "300",
          tour: "P-0100",
          pu: "2026-10-20T12:00:00.000Z",
          del: "2026-10-22T12:00:00.000Z",
        }),
      ],
    },
    {
      section: "in_transit",
      unit_id: "u-t20",
      unit_number: "T20",
      tour_display_id: "P-0050",
      legs: [
        loadedRow({
          unit_id: "u-t20",
          unit_number: "T20",
          load_number: "100",
          tour: "P-0050",
          pu: "2026-10-10T12:00:00.000Z",
          del: "2026-10-12T12:00:00.000Z",
        }),
      ],
    },
    {
      section: "in_transit",
      unit_id: "u-t30",
      unit_number: "T30",
      tour_display_id: "P-0200",
      legs: [
        loadedRow({
          unit_id: "u-t30",
          unit_number: "T30",
          load_number: "200",
          tour: "P-0200",
          pu: null,
          del: "2026-10-25T12:00:00.000Z",
        }),
      ],
    },
    {
      section: "available",
      unit_id: "u-avail",
      unit_number: "T99",
      tour_display_id: null,
      legs: [
        availableRow({
          unit_id: "u-avail",
          unit_number: "T99",
          driver_id: "drv-avail-1",
          driving_minutes_remaining: 660,
        }),
      ],
    },
  ];
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

function inTransitUnitOrder(): string[] {
  const section = screen.getByTestId("truck-line-section-in_transit");
  const rows = within(section).getAllByTestId(/^truck-line-row-/);
  return rows.map((row) => row.getAttribute("data-unit-id") ?? "");
}

describe("TruckLineBoard.sort (443.231)", () => {
  beforeEach(() => {
    vi.mocked(getTruckLine).mockResolvedValue({
      groups: fixtureGroups(),
      rows: fixtureGroups().flatMap((g) => g.legs),
      pending_rows: [],
      total_count: 4,
      loaded_count: 3,
      available_count: 1,
      stations: [],
      catalog_ready: true,
    });
  });

  it("reorders single-leg groups by LOAD / TOUR / PU / DEL asc and desc; null PU last both ways", async () => {
    render(
      wrap(
        <TruckLineBoard
          operatingCompanyId="5c854333-6ea5-4faa-af31-67cb272fef80"
          onLoadClick={() => {}}
          onAssignDriver={() => {}}
        />,
      ),
    );
    await waitFor(() => expect(screen.getByTestId("truck-line-row-u-t10")).toBeInTheDocument());

    // Default order = fixture order (T10, T20, T30)
    expect(inTransitUnitOrder()).toEqual(["u-t10", "u-t20", "u-t30"]);

    // LOAD asc: 100, 200, 300 → T20, T30, T10
    fireEvent.click(screen.getByTestId("truck-line-sort-load"));
    expect(inTransitUnitOrder()).toEqual(["u-t20", "u-t30", "u-t10"]);
    // LOAD desc
    fireEvent.click(screen.getByTestId("truck-line-sort-load"));
    expect(inTransitUnitOrder()).toEqual(["u-t10", "u-t30", "u-t20"]);
    // clear
    fireEvent.click(screen.getByTestId("truck-line-sort-load"));

    // TOUR asc natural: P-0050, P-0100, P-0200 → T20, T10, T30
    fireEvent.click(screen.getByTestId("truck-line-sort-tour"));
    expect(inTransitUnitOrder()).toEqual(["u-t20", "u-t10", "u-t30"]);
    fireEvent.click(screen.getByTestId("truck-line-sort-tour"));
    expect(inTransitUnitOrder()).toEqual(["u-t30", "u-t10", "u-t20"]);
    fireEvent.click(screen.getByTestId("truck-line-sort-tour"));

    // PU asc: Oct 10, Oct 20, null(last) → T20, T10, T30
    fireEvent.click(screen.getByTestId("truck-line-sort-pu"));
    expect(inTransitUnitOrder()).toEqual(["u-t20", "u-t10", "u-t30"]);
    // PU desc: Oct 20, Oct 10, null(still last) → T10, T20, T30
    fireEvent.click(screen.getByTestId("truck-line-sort-pu"));
    expect(inTransitUnitOrder()).toEqual(["u-t10", "u-t20", "u-t30"]);
    fireEvent.click(screen.getByTestId("truck-line-sort-pu"));

    // DEL asc: Oct 12, Oct 22, Oct 25 → T20, T10, T30
    fireEvent.click(screen.getByTestId("truck-line-sort-del"));
    expect(inTransitUnitOrder()).toEqual(["u-t20", "u-t10", "u-t30"]);
    fireEvent.click(screen.getByTestId("truck-line-sort-del"));
    expect(inTransitUnitOrder()).toEqual(["u-t30", "u-t10", "u-t20"]);
  });

  it("available row renders parked track + Load me bubble; Assign pill calls onAssignDriver", async () => {
    const onAssign = vi.fn();
    render(
      wrap(
        <TruckLineBoard
          operatingCompanyId="5c854333-6ea5-4faa-af31-67cb272fef80"
          onLoadClick={() => {}}
          onAssignDriver={onAssign}
        />,
      ),
    );
    await waitFor(() => expect(screen.getByTestId("truck-line-available-track-drv-avail-1")).toBeInTheDocument());

    const track = screen.getByTestId("truck-line-available-track-drv-avail-1");
    expect(within(track).getByTestId("truck-line-vehicle-available-drv-avail-1")).toBeInTheDocument();
    expect(track.textContent).toMatch(/Load me — 11h 00m drive left/);
    expect(screen.queryByText(/no trip in progress/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no load on this truck/i)).not.toBeInTheDocument();

    // Exactly one assign control
    const assignBtns = screen.getAllByTestId("truck-line-assign-drv-avail-1");
    expect(assignBtns).toHaveLength(1);
    fireEvent.click(assignBtns[0]!);
    expect(onAssign).toHaveBeenCalledWith("drv-avail-1", "u-avail");
  });
});
