import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as clientApi from "../../../api/client";
import * as mdataApi from "../../../api/mdata";
import { FLEET_TYPE_FILTER_OPTIONS } from "../../../components/fleet/fleetTypeFilter";
import { FleetTablePage } from "../FleetTablePage";

vi.mock("../../../components/FleetTable", () => ({
  FleetTable: () => <div data-testid="fleet-table-stub" />,
}));

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";

const allRows = [
  { id: "truck-1", kind: "truck" as const, unit_number: "101", type: "Truck", status: "InService" },
  { id: "trailer-1", kind: "trailer" as const, unit_number: "T-10", type: "Reefer", equipment_type: "Reefer", status: "InService" },
  { id: "trailer-2", kind: "trailer" as const, unit_number: "T-11", type: "Dry Van", equipment_type: "DryVan", status: "InService" },
];

function renderPage(initialEntries = ["/maintenance/fleet-table"]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>
        <FleetTablePage operatingCompanyId={companyId} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("FleetTablePage type filter", () => {
  beforeEach(() => {
    vi.spyOn(mdataApi, "listAllUnits").mockImplementation(async (params) => {
      const units = params.type === "Reefer" ? allRows.filter((row) => row.equipment_type === "Reefer") : allRows;
      return { units, total: units.length };
    });
    vi.spyOn(clientApi, "apiRequest").mockImplementation(async (url: string) => {
      if (url.includes("/fleet-table/kpis")) {
        return {
          total_units: 3,
          active_units: 3,
          in_shop_units: 0,
          out_of_service_units: 0,
          avg_age_years: 4.2,
        };
      }
      return { rows: [] };
    });
  });

  // FLT-01-COMBOBOX-SWEEP: this filter is now a SelectCombobox (real combo box: typeahead,
  // keyboard-nav, selectable), not a native <select> -- native-select-only APIs (.options,
  // fireEvent.change with a raw target.value) no longer apply. Interaction now matches every
  // other Combobox-based filter in the app: click to open the listbox, assert/click real
  // role="option" entries.
  it("renders type filter dropdown with All plus nine fleet types", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("fleet-page-filters-toggle")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("fleet-page-filters-toggle"));
    await waitFor(() => {
      expect(screen.getByLabelText("Filter fleet by type")).toBeTruthy();
    });
    await user.click(screen.getByLabelText("Filter fleet by type"));
    const listbox = await screen.findByRole("listbox");
    const optionLabels = within(listbox)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(optionLabels).toEqual(FLEET_TYPE_FILTER_OPTIONS.map((option) => option.label));
  });

  it("syncs ?type=Reefer in the URL when selecting Reefer", async () => {
    const user = userEvent.setup();
    renderPage(["/maintenance/fleet-table"]);
    await waitFor(() => {
      expect(screen.getByTestId("fleet-page-filters-toggle")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("fleet-page-filters-toggle"));
    await waitFor(() => {
      expect(screen.getByLabelText("Filter fleet by type")).toBeTruthy();
    });
    await user.click(screen.getByLabelText("Filter fleet by type"));
    const listbox = await screen.findByRole("listbox");
    await user.click(within(listbox).getByRole("option", { name: "Reefer" }));
    // Filters are staged (useStagedListFilters/CollapsedListFilters, the shared Apply/Cancel/Reset
    // chrome) — selecting an option only updates the draft; the URL/query commit fires on Apply.
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => {
      expect(screen.getByText("Showing 1 of 3 vehicles")).toBeTruthy();
    });
    expect(mdataApi.listAllUnits).toHaveBeenCalledWith(expect.objectContaining({ type: "Reefer", include: "trailers" }));
  });

  it("Clear filters resets type and shows full count", async () => {
    renderPage(["/maintenance/fleet-table?type=Reefer"]);
    await waitFor(() => {
      expect(screen.getByText("Showing 1 of 3 vehicles")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => {
      expect(screen.getByText("Showing 3 of 3 vehicles")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("fleet-page-filters-toggle"));
    await waitFor(() => {
      expect(screen.getByLabelText("Filter fleet by type")).toBeTruthy();
    });
    // Cleared draft (typeFilter: "") displays the empty-value option's own label ("All") as the
    // Combobox's placeholder text, matching FLEET_TYPE_FILTER_OPTIONS[0].
    expect((screen.getByLabelText("Filter fleet by type") as HTMLInputElement).value).toBe("All");
  });
});
