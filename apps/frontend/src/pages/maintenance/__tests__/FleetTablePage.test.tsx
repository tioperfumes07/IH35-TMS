import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as clientApi from "../../../api/client";
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
      const parsed = new URL(url, "http://localhost");
      const type = parsed.searchParams.get("type");
      const units = type === "Reefer" ? allRows.filter((row) => row.equipment_type === "Reefer") : allRows;
      return { units };
    });
  });

  it("renders type filter dropdown with All plus nine fleet types", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByLabelText("Filter fleet by type")).toBeTruthy();
    });
    const select = screen.getByLabelText("Filter fleet by type") as HTMLSelectElement;
    expect(select.options.length).toBe(FLEET_TYPE_FILTER_OPTIONS.length);
    expect(Array.from(select.options).map((option) => option.text)).toEqual(
      FLEET_TYPE_FILTER_OPTIONS.map((option) => option.label)
    );
  });

  it("syncs ?type=Reefer in the URL when selecting Reefer", async () => {
    renderPage(["/maintenance/fleet-table"]);
    await waitFor(() => {
      expect(screen.getByLabelText("Filter fleet by type")).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText("Filter fleet by type"), { target: { value: "Reefer" } });
    await waitFor(() => {
      expect(screen.getByText("Showing 1 of 3 vehicles")).toBeTruthy();
    });
    expect(clientApi.apiRequest).toHaveBeenCalledWith(expect.stringContaining("type=Reefer"));
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
    expect((screen.getByLabelText("Filter fleet by type") as HTMLSelectElement).value).toBe("");
  });
});
