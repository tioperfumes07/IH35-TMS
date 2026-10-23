/**
 * ROUND 443.256 — On-time station = searchable house Combobox (type-to-filter).
 * FAIL-OLD: hand-built reason <div> list with no search.
 * PASS: Combobox options include "On time — no exception" first + catalog reasons; typing narrows.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    listLoadExceptionReasons: vi.fn().mockResolvedValue({
      catalog_ready: true,
      reasons: [
        { id: "r-br", code: "breakdown_roadside", name: "Breakdown — roadside", is_active: true },
        { id: "r-bt", code: "breakdown_towed", name: "Breakdown — towed to shop", is_active: true },
        { id: "r-wx", code: "weather", name: "Weather / road closure", is_active: true },
        { id: "r-ot", code: "other", name: "Other (note required)", is_active: true },
      ],
    }),
    recordTruckLineException: vi.fn().mockResolvedValue({ id: "iss-1", reported_at: new Date().toISOString() }),
    resolveTruckLineException: vi.fn().mockResolvedValue({ id: "iss-1", status: "resolved" }),
  };
});

vi.mock("../../hooks/useLoadCostRollups", () => ({
  useLoadCostRollups: () => new Map(),
}));

import { getTruckLine, recordTruckLineException, resolveTruckLineException } from "../../api/truckLine";

function inTransitRow(overrides?: Partial<TruckLineRow["station"]>): TruckLineRow {
  return {
    kind: "loaded",
    unit_id: "u-t171",
    unit_number: "T171",
    tour_display_id: "P-0099",
    load: {
      load_id: "load-13696",
      load_number: "13696",
      status: "in_transit",
      trip_type: "NB",
      rate_total_cents: 10000,
      customer_name: "Acme",
      pickup: { city: "Laredo", state: "TX" },
      delivery: { city: "Dallas", state: "TX" },
    },
    drivers: [{ id: "drv-1", name: "Driver One" }],
    station: {
      reached_index: 3,
      next_index: 5,
      stamps: [],
      has_open_exception: false,
      exception_reason_label: null,
      open_exception_id: null,
      ...overrides,
    },
    position: null,
    next_appointment: null,
    appointments: {
      pickup: { at: "2026-10-22T12:00:00Z", at_source: "appointment_start_at", late: false },
      delivery: { at: "2026-10-23T12:00:00Z", at_source: "appointment_start_at", late: false },
    },
  };
}

function fixtureResponse(row: TruckLineRow = inTransitRow()) {
  const groups: TruckLineGroup[] = [
    {
      section: "in_transit",
      unit_id: "u-t171",
      unit_number: "T171",
      tour_display_id: "P-0099",
      legs: [row],
    },
  ];
  return {
    groups,
    rows: groups.flatMap((g) => g.legs),
    pending_rows: [],
    total_count: 1,
    loaded_count: 1,
    available_count: 0,
    stations: [],
    catalog_ready: true,
  };
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("TruckLineBoard.statusCombobox (443.256)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTruckLine).mockResolvedValue(fixtureResponse() as Awaited<ReturnType<typeof getTruckLine>>);
  });

  it("opens On-time station as a Combobox labelled Status — T171 · 13696 with On time first", async () => {
    const user = userEvent.setup();
    render(wrap(<TruckLineBoard operatingCompanyId="5c854333-6ea5-4faa-af31-67cb272fef80" onLoadClick={() => {}} onAssignDriver={() => {}} />));

    await waitFor(() => expect(screen.getByTestId("truck-line-status-node-u-t171")).toBeInTheDocument());
    await user.click(screen.getByTestId("truck-line-status-node-u-t171"));

    expect(screen.getByTestId("truck-line-status-popover-label")).toHaveTextContent("Status — T171 · 13696");
    expect(screen.queryByTestId("truck-line-reason-list")).toBeNull();
    const input = screen.getByTestId("truck-line-reason-combobox");
    expect(input).toBeInTheDocument();

    await user.click(input);
    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
    const listbox = screen.getByRole("listbox");
    const options = within(listbox).getAllByRole("option");
    expect(options[0]).toHaveTextContent("On time — no exception");
    expect(options.map((o) => o.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Breakdown — roadside"),
        expect.stringContaining("Breakdown — towed to shop"),
        expect.stringContaining("Weather / road closure"),
      ]),
    );
  });

  it("typing brea narrows to the two breakdown reasons; pick records exception", async () => {
    const user = userEvent.setup();
    render(wrap(<TruckLineBoard operatingCompanyId="5c854333-6ea5-4faa-af31-67cb272fef80" onLoadClick={() => {}} onAssignDriver={() => {}} />));
    await waitFor(() => expect(screen.getByTestId("truck-line-status-node-u-t171")).toBeInTheDocument());
    await user.click(screen.getByTestId("truck-line-status-node-u-t171"));

    const input = screen.getByTestId("truck-line-reason-combobox");
    await user.click(input);
    await user.clear(input);
    await user.type(input, "brea");

    await waitFor(() => {
      const listbox = screen.getByRole("listbox");
      const options = within(listbox).getAllByRole("option");
      expect(options).toHaveLength(2);
      expect(options.every((o) => /Breakdown/i.test(o.textContent ?? ""))).toBe(true);
    });

    await user.click(within(screen.getByRole("listbox")).getByText(/Breakdown — roadside/i));
    await waitFor(() => expect(recordTruckLineException).toHaveBeenCalledTimes(1));
    expect(vi.mocked(recordTruckLineException).mock.calls[0][0]).toMatchObject({
      load_id: "load-13696",
      reason_id: "r-br",
      operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80",
    });
  });

  it("picking On time — no exception resolves an open exception", async () => {
    const user = userEvent.setup();
    vi.mocked(getTruckLine).mockResolvedValue(
      fixtureResponse(
        inTransitRow({
          has_open_exception: true,
          exception_reason_label: "Weather / road closure",
          open_exception_id: "iss-open-1",
        }),
      ) as Awaited<ReturnType<typeof getTruckLine>>,
    );

    render(wrap(<TruckLineBoard operatingCompanyId="5c854333-6ea5-4faa-af31-67cb272fef80" onLoadClick={() => {}} onAssignDriver={() => {}} />));
    await waitFor(() => expect(screen.getByTestId("truck-line-status-node-u-t171")).toBeInTheDocument());
    await user.click(screen.getByTestId("truck-line-status-node-u-t171"));

    const input = screen.getByTestId("truck-line-reason-combobox");
    await user.click(input);
    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
    await user.click(within(screen.getByRole("listbox")).getByText("On time — no exception"));
    await waitFor(() => expect(resolveTruckLineException).toHaveBeenCalledWith("iss-open-1", "5c854333-6ea5-4faa-af31-67cb272fef80"));
  });

  it("keyboard ArrowDown + Enter selects the highlighted reason", async () => {
    const user = userEvent.setup();
    render(wrap(<TruckLineBoard operatingCompanyId="5c854333-6ea5-4faa-af31-67cb272fef80" onLoadClick={() => {}} onAssignDriver={() => {}} />));
    await waitFor(() => expect(screen.getByTestId("truck-line-status-node-u-t171")).toBeInTheDocument());
    await user.click(screen.getByTestId("truck-line-status-node-u-t171"));

    const input = screen.getByTestId("truck-line-reason-combobox");
    await user.click(input);
    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());
    // index 0 = On time; ArrowDown once → first catalog reason
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(recordTruckLineException).toHaveBeenCalled());
  });
});
