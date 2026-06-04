import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as maintenanceApi from "../../../api/maintenance";
import { TrailerReeferSection } from "../TrailerReeferSection";

const COMPANY = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
const TRAILER = "eq-reefer-1";

const snapshotFixture = {
  specs: {
    id: "spec-1",
    equipment_id: TRAILER,
    reefer_brand: "Carrier",
    service_interval_hours: 2000,
    last_service_hours: 2500,
    current_hours: 4400,
    hours_until_service: 100,
    pm_status: "near_due" as const,
  },
  history: [
    {
      id: "log-1",
      hours_reading: 4400,
      source: "samsara",
      source_label: "Samsara",
      recorded_at: "2026-06-04T08:00:00Z",
      notes: "Samsara ingest",
    },
  ],
};

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TrailerReeferSection trailerId={TRAILER} companyId={COMPANY} />
    </QueryClientProvider>
  );
}

describe("TrailerReeferSection (A19)", () => {
  beforeEach(() => {
    vi.spyOn(maintenanceApi, "fetchMaintenanceReeferHoursSnapshot").mockResolvedValue(snapshotFixture);
    vi.spyOn(maintenanceApi, "createMaintenanceReeferHoursLogEntry").mockResolvedValue({
      id: "log-2",
      hours_reading: 4500,
      source: "manual",
      source_label: "Manual",
      recorded_at: "2026-06-04T09:00:00Z",
      notes: "",
    } as never);
    vi.spyOn(maintenanceApi, "updateMaintenanceReeferSpecs").mockResolvedValue(snapshotFixture.specs as never);
  });

  it("renders live reefer hours snapshot", async () => {
    renderSection();
    expect(await screen.findByText("Reefer hours tracking")).toBeTruthy();
    expect(screen.getByText("Carrier")).toBeTruthy();
    expect(screen.getAllByText("4400").length).toBeGreaterThan(0);
    expect(screen.getByTestId("reefer-hours-history")).toBeTruthy();
  });

  it("records manual reefer hours entry", async () => {
    renderSection();
    await screen.findByTestId("reefer-hours-input");
    fireEvent.change(screen.getByTestId("reefer-hours-input"), { target: { value: "4500" } });
    fireEvent.click(screen.getByTestId("reefer-hours-record-btn"));
    await waitFor(() => {
      expect(maintenanceApi.createMaintenanceReeferHoursLogEntry).toHaveBeenCalledWith(
        expect.objectContaining({ hours_reading: 4500, equipment_id: TRAILER })
      );
    });
  });

  it("marks service at current hours", async () => {
    renderSection();
    await screen.findByTestId("reefer-mark-service-btn");
    fireEvent.click(screen.getByTestId("reefer-mark-service-btn"));
    await waitFor(() => {
      expect(maintenanceApi.updateMaintenanceReeferSpecs).toHaveBeenCalledWith(
        expect.objectContaining({ last_service_hours: 4400, equipment_id: TRAILER })
      );
    });
  });
});
