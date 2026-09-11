import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import "../../design/design-tokens.css";
import { DispatchOverview } from "./DispatchOverview";
import type { UnitsWithoutLoad } from "../../api/dispatch";

// REG-038 (owner 2026-09-10/11, verbatim: "the kpis in dispatch home are not real ... each kpi must
// have its own columns and look clean"). This suite proves: (1) all 8 top-level KPI tiles render a
// REAL number sourced from the mocked queries below, never a hardcoded/dead value; (2) the four
// REG-038 panels (Units needing return / Unassigned units / Days since last delivery / Round-trip
// exposure) render a genuine Unit/Driver/Load column header, not the old concatenated single-span
// row; (3) a unit with a real last-delivered load shows it as a Load-column link, a unit that has
// never delivered one shows an honest "—", never a placeholder string; (4) "Days since last
// delivery" sorts worst-first and its own tile matches the panel's own top row; (5) "Round-trip
// exposure" renders every row the tile counted (no PANEL_ROW_LIMIT slice), since it is now itself a
// KPI-tile-backed panel bound by this file's own "tile value must equal drill table row count" law.

vi.mock("../../components/dispatch/DispatchLoadCostsPanel", () => ({
  DispatchLoadCostsPanel: () => <div data-testid="load-costs-panel-stub" />,
}));

// vi.mock factories are hoisted above top-level const declarations -- vi.hoisted() lets the fixtures
// used inside the factory below (and re-used in assertions further down) survive that hoist.
const { UNIT_WITH_LAST_LOAD, UNIT_WORST_IDLE, UNIT_NEVER_DELIVERED, EXPOSURE_LOADS } = vi.hoisted(() => {
  const unitWithLastLoad: UnitsWithoutLoad = {
    id: "unit-idle-1",
    unit_number: "T900",
    trailer_id: null,
    trailer_number: null,
    driver_id: "driver-1",
    driver_name: "Alicia Ramirez",
    last_drop_at: "2026-09-01T12:00:00.000Z",
    last_delivered_load_id: "load-old-1",
    last_delivered_load_number: "13900",
    hours_since_last_delivery: 240, // 10d
    location: null,
  };

  const unitWorstIdle: UnitsWithoutLoad = {
    id: "unit-idle-2",
    unit_number: "T901",
    trailer_id: null,
    trailer_number: null,
    driver_id: "driver-2",
    driver_name: "Beto Salinas",
    last_drop_at: "2026-08-20T12:00:00.000Z",
    last_delivered_load_id: "load-old-2",
    last_delivered_load_number: "13850",
    hours_since_last_delivery: 480, // 20d -- longer idle than unitWithLastLoad
    location: null,
  };

  const unitNeverDelivered: UnitsWithoutLoad = {
    id: "unit-fresh-1",
    unit_number: "T902",
    trailer_id: null,
    trailer_number: null,
    driver_id: null,
    driver_name: null,
    last_drop_at: null,
    last_delivered_load_id: null,
    last_delivered_load_number: null,
    hours_since_last_delivery: null,
    location: null,
  };

  function exposureLoad(id: string, loadNumber: string) {
    return {
      id,
      load_number: loadNumber,
      status: "in_transit",
      assigned_unit_id: `unit-${id}`,
      unit_number: `T${id}`,
      assigned_primary_driver_id: `driver-${id}`,
      driver_short_name: `Driver ${id}`,
      customer_id: `cust-${id}`,
      customer_name: `Customer ${id}`,
    };
  }
  // 7 rows -- one more than the shared PANEL_ROW_LIMIT (6) used by unrelated panels in this file, so
  // a regression that reintroduces a slice on Round-trip exposure is caught by a missing 7th row.
  const exposureLoads = Array.from({ length: 7 }, (_, i) => exposureLoad(`exp-${i + 1}`, `139${i}0`));

  return {
    UNIT_WITH_LAST_LOAD: unitWithLastLoad,
    UNIT_WORST_IDLE: unitWorstIdle,
    UNIT_NEVER_DELIVERED: unitNeverDelivered,
    EXPOSURE_LOADS: exposureLoads,
  };
});

vi.mock("../../api/dispatch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/dispatch")>();
  return {
    ...actual,
    getDispatchDashboard: vi.fn().mockResolvedValue({ on_load: 5, in_transit: 3, delivered: 2 }),
    listAtRiskOrLateDispatchLoads: vi.fn().mockResolvedValue({ count: 1, loads: [] }),
    listUnitsWithoutLoad: vi.fn().mockResolvedValue({
      units: [UNIT_WITH_LAST_LOAD, UNIT_WORST_IDLE, UNIT_NEVER_DELIVERED],
    }),
    listDispatchLoads: vi.fn().mockResolvedValue({ loads: EXPOSURE_LOADS }),
    listAllDispatchLoads: vi.fn().mockResolvedValue({ loads: [] }),
    getDetentionBoard: vi.fn().mockResolvedValue({ count: 0, active_count: 0, events: [] }),
  };
});

vi.mock("../../api/loads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/loads")>();
  return {
    ...actual,
    listLoadsNeedingDriverBillRemint: vi.fn().mockResolvedValue({ real_count: 0, loads: [] }),
  };
});

vi.mock("../../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client")>();
  return {
    ...actual,
    apiRequest: vi.fn().mockResolvedValue({ data: [] }),
  };
});

function renderOverview() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DispatchOverview operatingCompanyId="op-co-1" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DispatchOverview — REG-038 Dispatch Home KPIs real + own columns", () => {
  it("renders all 8 top-level KPI tiles with real (non-dead) values from the mocked live queries", async () => {
    renderOverview();

    // findByTestId only waits for the tile SHELL to mount (it renders synchronously regardless of
    // query state) -- waitFor is what actually waits for the mocked queries to resolve and the
    // honest "—" loading placeholder to be replaced by a real number.
    await waitFor(() => expect(screen.getByTestId("dispatch-overview-kpi-active-loads")).toHaveTextContent("5"));
    expect(screen.getByTestId("dispatch-overview-kpi-delivered-pending-docs")).toHaveTextContent("2");
    expect(screen.getByTestId("dispatch-overview-kpi-at-risk-late")).toHaveTextContent("1");
    expect(screen.getByTestId("dispatch-overview-kpi-detention")).toHaveTextContent("0");
    expect(screen.getByTestId("dispatch-overview-kpi-units-available")).toHaveTextContent("3");
    // Only 2 of the 3 mocked units have a last_drop_at (the "never delivered" one does not count).
    expect(screen.getByTestId("dispatch-overview-kpi-units-needing-return")).toHaveTextContent("2");
    // Net-new REG-038 tiles.
    expect(screen.getByTestId("dispatch-overview-kpi-round-trip-exposure")).toHaveTextContent("7");
    // Worst-case idle unit is UNIT_WORST_IDLE at 480h = 20d.
    expect(screen.getByTestId("dispatch-overview-kpi-days-since-last-delivery")).toHaveTextContent("20d");
  });

  it("gives each REG-038 panel a real Unit/Driver/Load column header, not one concatenated span", async () => {
    renderOverview();
    await waitFor(() => expect(screen.getByTestId("dispatch-overview-kpi-active-loads")).toHaveTextContent("5"));

    for (const testId of [
      "dispatch-units-needing-return-panel",
      "dispatch-unassigned-units-panel",
      "dispatch-days-since-last-delivery-panel",
      "dispatch-round-trip-exposure-panel",
    ]) {
      const panel = screen.getByTestId(testId);
      expect(within(panel).getByText("Unit")).toBeInTheDocument();
      expect(within(panel).getByText("Driver")).toBeInTheDocument();
      expect(within(panel).getByText("Load")).toBeInTheDocument();
    }
    // "Days since last delivery" gets a 4th column for the metric itself.
    expect(within(screen.getByTestId("dispatch-days-since-last-delivery-panel")).getByText("Days idle")).toBeInTheDocument();
  });

  it("shows a real Load-column link for a unit with a last delivery, and an honest — for one that never delivered", async () => {
    renderOverview();
    const panel = screen.getByTestId("dispatch-unassigned-units-panel");

    // UNIT_WITH_LAST_LOAD's real last load number renders as a link, not a placeholder string.
    await waitFor(() => expect(within(panel).getByText("13900")).toBeInTheDocument());
    expect(within(panel).queryByText("Need load")).not.toBeInTheDocument();
    // UNIT_NEVER_DELIVERED has no last_delivered_load_id — an honest em-dash, not a fabricated load.
    expect(within(panel).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("sorts Days since last delivery worst-first and its top row matches the tile's own number", async () => {
    renderOverview();
    const panel = screen.getByTestId("dispatch-days-since-last-delivery-panel");
    await waitFor(() => expect(within(panel).queryAllByText(/^\d+d$/).length).toBeGreaterThan(0));
    const rows = within(panel).getAllByText(/^\d+d$/);
    // First rendered "Nd" cell must be the 20d worst-case row (T901), matching the tile.
    expect(rows[0]).toHaveTextContent("20d");
    expect(within(panel).getByText("T901")).toBeInTheDocument();
  });

  it("renders every Round-trip exposure row the tile counted — no PANEL_ROW_LIMIT slice", async () => {
    renderOverview();
    const panel = screen.getByTestId("dispatch-round-trip-exposure-panel");
    // 7 mocked exposure loads; a reintroduced .slice(0, 6) would drop the 7th.
    for (const load of EXPOSURE_LOADS) {
      await waitFor(() => expect(within(panel).getByText(load.load_number)).toBeInTheDocument());
    }
  });
});
