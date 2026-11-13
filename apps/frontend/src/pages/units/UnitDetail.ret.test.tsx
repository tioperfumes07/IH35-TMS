// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnitDetail } from "./UnitDetail";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../api/mdata", () => ({
  getUnit: vi.fn().mockResolvedValue({ id: "unit-1", unit_number: "101" }),
}));

vi.mock("../../components/units/UnitHeaderPhoto", () => ({
  UnitHeaderPhoto: () => null,
}));

// Detail reverse sections / tabs need company toast context; stub for Back-only coverage.
vi.mock("./UnitPermitsTab", () => ({ UnitPermitsTab: () => null }));
vi.mock("./UnitTollTagsTab", () => ({ UnitTollTagsTab: () => null }));
vi.mock("./UnitFinanceLinkageTab", () => ({ UnitFinanceLinkageTab: () => null }));
vi.mock("../../components/tasks/TasksTab", () => ({ TasksTab: () => null }));
vi.mock("../maintenance/units/UnitBrakesTab", () => ({ UnitBrakesTab: () => null }));
vi.mock("../maintenance/units/UnitTiresTab", () => ({ UnitTiresTab: () => null }));
vi.mock("../../components/maintenance/UnitMaintenanceInspectionsReverseSection", () => ({
  UnitMaintenanceInspectionsReverseSection: () => null,
}));
vi.mock("../../components/dispatch/UnitInTransitIssuesReverseSection", () => ({
  UnitInTransitIssuesReverseSection: () => null,
}));
vi.mock("../../components/fleet/UnitDefaultDriversReverseSection", () => ({
  UnitDefaultDriversReverseSection: () => null,
}));
vi.mock("../../components/maintenance/UnitTireProgramReverseSection", () => ({
  UnitTireProgramReverseSection: () => null,
}));
vi.mock("../../components/maintenance/UnitSevereRepairsReverseSection", () => ({
  UnitSevereRepairsReverseSection: () => null,
}));
vi.mock("../../components/maintenance/PmCostPerMilePanel", () => ({ PmCostPerMilePanel: () => null }));
vi.mock("../../components/safety/UnitTempCoverReverseSection", () => ({
  UnitTempCoverReverseSection: () => null,
}));
vi.mock("../../components/safety/ComplaintsReverseSection", () => ({ ComplaintsReverseSection: () => null }));
vi.mock("../../components/fuel/FuelCardsReverseSection", () => ({ FuelCardsReverseSection: () => null }));

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{`${loc.pathname}${loc.search}`}</div>;
}

function wrap(entry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/fleet/units/:id/detail" element={<UnitDetail />} />
          <Route path="/dispatch/planners/trucks" element={<LocationProbe />} />
          <Route path="/fleet" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("UnitDetail ret Back (board12)", () => {
  afterEach(() => cleanup());

  it("Back restores planner origin from ret (not hardcoded /fleet)", async () => {
    const origin = "/dispatch/planners/trucks?planner_driver_ids=drv-a,drv-p";
    wrap(`/fleet/units/unit-1/detail?ret=${encodeURIComponent(origin)}`);
    await screen.findByTestId("unit-detail-page");
    fireEvent.click(screen.getByRole("button", { name: /^Back$/i }));
    expect(screen.getByTestId("loc").textContent).toBe(origin);
  });

  it("Back falls back to /fleet when ret is absent", async () => {
    wrap(`/fleet/units/unit-1/detail`);
    await screen.findByTestId("unit-detail-page");
    fireEvent.click(screen.getByRole("button", { name: /^Back$/i }));
    expect(screen.getByTestId("loc").textContent).toBe("/fleet");
  });
});
