// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import * as mdataApi from "../../../api/mdata";
import * as safetyApi from "../../../api/safety";
import { DriverProfilePage } from "../DriverProfilePage";
import { ToastProvider } from "../../../components/Toast";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

const profileFixture = {
  driver: { id: "d-test-1", first_name: "Jane", last_name: "Driver", status: "Active" },
  license: {},
  medical_card: {},
  drug_program: {},
  hos: null,
  current_assignment: { default_truck: null, currently_driving_truck: null, current_load: null },
  performance_scorecard: null,
  settlements: {},
  training_records: [],
  border_credentials: {},
  documents: [],
};

function renderPage(initialEntry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/drivers/:id/profile" element={<DriverProfilePage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("DriverProfilePage assign_truck deeplink", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.spyOn(mdataApi, "listUnits").mockResolvedValue({
      units: [{ id: "u-1", unit_number: "T101", kind: "truck" }],
      total: 1,
    } as never);
    vi.spyOn(clientApi, "apiRequest").mockResolvedValue(profileFixture as never);
    vi.spyOn(safetyApi, "listDriverQualificationItems").mockResolvedValue({ items: [] } as never);
  });

  it("opens AssignTruckModal when ?assign_truck=1 is present", async () => {
    renderPage("/drivers/d-test-1/profile?assign_truck=1");
    expect(await screen.findByText("Assign default truck · Jane Driver")).toBeTruthy();
    expect(await screen.findByTestId("assign-truck-confirm")).toBeTruthy();
  });
});
