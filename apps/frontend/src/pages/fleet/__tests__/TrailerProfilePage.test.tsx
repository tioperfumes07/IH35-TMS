import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { TrailerProfilePage } from "../TrailerProfilePage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../../components/maintenance/ServiceTimeline", () => ({
  ServiceTimeline: () => <div data-testid="service-timeline" />,
}));

vi.mock("../../../api/maintenance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/maintenance")>();
  return {
    ...actual,
    fetchMaintenanceReeferHoursSnapshot: vi.fn().mockResolvedValue({
      specs: { current_hours: 4400, reefer_brand: "Carrier", service_interval_hours: 2000, hours_until_service: 100, pm_status: "near_due" },
      history: [],
    }),
  };
});

const aggregateFixture = {
  equipment: { equipment_number: "T-100", equipment_type: "Reefer", status: "InService", vin: "VIN1" },
  type_specs: { length_ft: 53 },
  current_assignment: { attached_to_unit: null, current_load: null },
  reefer: { reefer_brand: "Carrier" },
  samsara_telemetry: null,
  maintenance: { open_wo_count: 0, next_pm_due: null, last_service: null },
  compliance: { dot_inspection: {}, us_insurance: {}, mx_insurance: {} },
  documents: [],
  plates: [{ id: "p1", country: "US", jurisdiction: "TX", plate_number: "ABC123", expiration: "2027-01-01" }],
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/fleet/trailers/eq-1"]}>
          <Routes>
            <Route path="/fleet/trailers/:id" element={<TrailerProfilePage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("TrailerProfilePage", () => {
  beforeEach(() => {
    vi.spyOn(clientApi, "apiRequest").mockResolvedValue(aggregateFixture as never);
  });

  it("renders trailer profile sections", async () => {
    renderPage();
    expect(await screen.findByTestId("tp-section-1-identity")).toBeTruthy();
    expect(screen.getByTestId("tp-section-2-specs")).toBeTruthy();
    expect(screen.getByTestId("tp-section-3-assignment")).toBeTruthy();
    expect(screen.getByTestId("tp-section-4-reefer")).toBeTruthy();
    expect(screen.getByTestId("tp-section-5-maintenance")).toBeTruthy();
    expect(screen.getByTestId("tp-section-6-compliance")).toBeTruthy();
    expect(screen.getByTestId("tp-section-7-documents")).toBeTruthy();
    expect(screen.getByTestId("tp-section-8-action-bar")).toBeTruthy();
    expect(screen.getByTestId("tp-section-9-activity")).toBeTruthy();
    expect(screen.getByTestId("tp-reefer-a19-slot")).toBeTruthy();
    expect(await screen.findByText("Reefer hours tracking")).toBeTruthy();
  });

  it("does not render reefer A19 slot for dry van", async () => {
    vi.spyOn(clientApi, "apiRequest").mockResolvedValue({
      ...aggregateFixture,
      equipment: { ...aggregateFixture.equipment, equipment_type: "DryVan" },
      reefer: null,
    } as never);
    renderPage();
    await screen.findByTestId("tp-section-1-identity");
    expect(screen.queryByTestId("tp-reefer-a19-slot")).toBeNull();
  });
});
