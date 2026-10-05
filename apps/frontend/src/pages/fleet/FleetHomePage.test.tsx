import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { FleetHomePage, parseFleetHomeTab } from "./FleetHomePage";
import { ToastProvider } from "../../components/Toast";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "company-1" }),
}));

vi.mock("../../api/mdata", () => ({
  listAllUnits: vi.fn(async () => ({
    units: [
      { id: "u1", unit_number: "T100", status: "InService", assigned_driver_id: null },
      { id: "u2", unit_number: "T101", status: "InMaintenance", assigned_driver_id: "d1" },
      { id: "u3", unit_number: "T102", status: "OutOfService", assigned_driver_id: "d2" },
    ],
    total: 3,
  })),
  listEquipment: vi.fn(async () => ({
    equipment: [
      { id: "e1", unit_number: "TR1", status: "InService", current_unit_id: null },
      { id: "e2", unit_number: "TR2", status: "InService", current_unit_id: "u1" },
    ],
  })),
}));

vi.mock("../../api/maintenance", () => ({
  listWorkOrdersFiltered: vi.fn(async () => ({ work_orders: [{ id: "wo1" }], total_count: 1 })),
}));

vi.mock("../../components/fleet/CreateUnitModal", () => ({
  CreateUnitModal: () => null,
}));
vi.mock("../../components/fleet/CreateTrailerModal", () => ({
  CreateTrailerModal: () => null,
}));
vi.mock("../maintenance/FleetTablePage", () => ({
  FleetTablePage: () => <div data-testid="fleet-table-stub" />,
}));

function wrap(ui: ReactElement, path = "/fleet") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("FleetHomePage — module home", () => {
  it("parseFleetHomeTab defaults to home", () => {
    expect(parseFleetHomeTab(null)).toBe("home");
    expect(parseFleetHomeTab("units")).toBe("units");
    expect(parseFleetHomeTab("FLEET")).toBe("home");
  });

  it("renders sentence-case Fleet, KPI strip, tabs, and FLT-F428 banner", async () => {
    wrap(<FleetHomePage />);
    expect(await screen.findByTestId("fleet-home-page")).toBeTruthy();
    expect(screen.getByTestId("fleet-kpi-strip")).toBeTruthy();
    expect(screen.getByTestId("fleet-module-tabs")).toBeTruthy();
    expect(screen.getByTestId("fleet-flt-f428-banner")).toBeTruthy();
    expect(screen.getByText("Fleet")).toBeTruthy();
    expect(screen.queryByText("FLEET")).toBeNull();
    expect(await screen.findByTestId("fleet-home-attention")).toBeTruthy();
  });
});
