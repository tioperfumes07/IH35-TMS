import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as clientApi from "../../api/client";
import { FleetTable, type FleetRow } from "../FleetTable";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock("../Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

// Bulk actions are permission-gated (useBulkPermission → useAuth). Provide an Owner so
// the BulkActionBar renders in tests.
vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "Owner" } }),
}));

const rows: FleetRow[] = [
  {
    id: "truck-1",
    kind: "truck",
    unit_number: "101",
    vin: "VIN1",
    type: "Truck",
    status: "InService",
    is_oos: false,
  },
  {
    id: "trailer-1",
    kind: "trailer",
    unit_number: "T-10",
    vin: "VIN2",
    type: "Dry Van",
    equipment_type: "DryVan",
    status: "InService",
  },
];

function renderTable(showMaintenanceColumns = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <FleetTable
          operatingCompanyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071"
          rows={rows}
          softDeleteFilter="active"
          onSoftDeleteFilterChange={() => {}}
          showMaintenanceColumns={showMaintenanceColumns}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("FleetTable unified list", () => {
  beforeEach(() => {
    navigate.mockReset();
    vi.spyOn(clientApi, "apiRequest").mockResolvedValue({ affected_count: 1 });
  });

  it("renders unified list with trucks and trailers", () => {
    renderTable();
    expect(screen.getByText("101")).toBeTruthy();
    expect(screen.getByText("T-10")).toBeTruthy();
  });

  it("Type column renders correct value per kind", () => {
    renderTable();
    // The Type list-filter dropdown also renders these as <option>s, so allow duplicates.
    expect(screen.getAllByText("Truck").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Dry Van").length).toBeGreaterThan(0);
  });

  it("base mode (/fleet): Unit is plain text, no maintenance columns, row click navigates by kind", () => {
    renderTable(false);
    // Unit is NOT a link in base mode — /fleet renders identically to before the keystone.
    expect(screen.getByText("101").closest("a")).toBeNull();
    // The 3 maintenance columns are absent.
    expect(screen.queryByText("Odometer")).toBeNull();
    expect(screen.queryByText("Next PM")).toBeNull();
    expect(screen.queryByText("Open WO")).toBeNull();
    // Whole-row click navigates by kind.
    fireEvent.click(screen.getByText("101"));
    expect(navigate).toHaveBeenCalledWith("/fleet/units/truck-1");
    fireEvent.click(screen.getByText("T-10"));
    expect(navigate).toHaveBeenCalledWith("/fleet/trailers/trailer-1");
  });

  it("maintenance mode: Unit is a profile link, 3 maintenance columns render, row click still works", () => {
    renderTable(true);
    // Keystone opt-in: the Unit cell is a real anchor to the profile route.
    expect(screen.getByText("101").closest("a")?.getAttribute("href")).toBe("/fleet/units/truck-1");
    expect(screen.getByText("T-10").closest("a")?.getAttribute("href")).toBe("/fleet/trailers/trailer-1");
    // The 3 maintenance columns are present.
    expect(screen.getByText("Odometer")).toBeTruthy();
    expect(screen.getByText("Next PM")).toBeTruthy();
    expect(screen.getByText("Open WO")).toBeTruthy();
    // Clicking a non-link cell still navigates the whole row by kind (row-click preserved).
    fireEvent.click(screen.getByText("VIN1"));
    expect(navigate).toHaveBeenCalledWith("/fleet/units/truck-1");
    fireEvent.click(screen.getByText("VIN2"));
    expect(navigate).toHaveBeenCalledWith("/fleet/trailers/trailer-1");
  });

  it("bulk-update routes to correct endpoint per kind", async () => {
    renderTable();
    // Select the two rows by their stable per-row checkbox aria-labels (robust to the
    // toolbar's select-all + column-chooser checkboxes).
    fireEvent.click(screen.getByLabelText("Select unit 101"));
    fireEvent.click(screen.getByLabelText("Select unit T-10"));
    fireEvent.change(screen.getByLabelText("Change Status"), { target: { value: "Active" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await vi.waitFor(() => {
      expect(clientApi.apiRequest).toHaveBeenCalled();
    });

    const urls = vi.mocked(clientApi.apiRequest).mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes("/api/v1/mdata/units/bulk-update"))).toBe(true);
    expect(urls.some((url) => url.includes("/api/v1/mdata/equipment/bulk-update"))).toBe(true);
  });
});
