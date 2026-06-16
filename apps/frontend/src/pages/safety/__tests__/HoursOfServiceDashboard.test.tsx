import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as hosApi from "../../../api/hos";
import * as mdataApi from "../../../api/mdata";
import * as safetyV64 from "../../../api/safetyV64";
import { HoursOfServicePage } from "../HoursOfServicePage";

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("HoursOfServicePage", () => {
  beforeEach(() => {
    vi.spyOn(mdataApi, "listDrivers").mockResolvedValue({
      total: 0,
      drivers: [
        { id: "driver-on", first_name: "On", last_name: "Duty", status: "Active" } as never,
        { id: "driver-off", first_name: "Off", last_name: "Duty", status: "Active" } as never,
      ],
    });
    vi.spyOn(hosApi, "getDriverHosDetail").mockImplementation(async (driverId: string) => {
      if (driverId === "driver-on") {
        return {
          driver_id: driverId,
          clocks: {
            drive_remaining_min: 25,
            window_remaining_min: 400,
            break_remaining_min: 300,
            cycle_remaining_min: 2000,
            last_reset_at: null,
            status: "warning_15min",
          },
          timeline_24h: [{ id: "e1", duty_status: "driving", started_at: "2026-06-03T10:00:00Z", ended_at: null, unit_id: null, source: "eld", odometer_mi: null, location: null }],
          summary_8d: [],
          manual_edits: { count: 0, requires_supervisor_signoff: true, events: [] },
        };
      }
      return {
        driver_id: driverId,
        clocks: {
          drive_remaining_min: 600,
          window_remaining_min: 700,
          break_remaining_min: 400,
          cycle_remaining_min: 3000,
          last_reset_at: null,
          status: "ok",
        },
        timeline_24h: [{ id: "e2", duty_status: "off_duty", started_at: "2026-06-03T08:00:00Z", ended_at: null, unit_id: null, source: "eld", odometer_mi: null, location: null }],
        summary_8d: [],
        manual_edits: { count: 0, requires_supervisor_signoff: true, events: [] },
      };
    });
    vi.spyOn(safetyV64, "listHosViolations").mockResolvedValue({
      hos_violations: [
        {
          id: "vio-1",
          driver_id: "driver-on",
          violation_code: "11_HOUR",
          occurred_at: "2026-06-02T12:00:00Z",
        },
      ],
    });
  });

  it("renders KPI tiles from live fleet duty status", async () => {
    render(wrap(<HoursOfServicePage operatingCompanyId={companyId} />));
    await waitFor(() => {
      expect(screen.getByTestId("safety-hos-kpi-on-duty").textContent).toContain("1");
    });
    expect(screen.getByTestId("safety-hos-kpi-off-duty").textContent).toContain("1");
    expect(screen.getByTestId("safety-hos-kpi-approaching-cap").textContent).toContain("1");
    expect(screen.getByTestId("safety-hos-row-driver-on")).toBeTruthy();
  });

  it("shows violations panel and link to canonical create route", async () => {
    render(wrap(<HoursOfServicePage operatingCompanyId={companyId} />));
    await waitFor(() => {
      expect(screen.getByTestId("safety-hos-violations-panel").textContent).toContain("11_HOUR");
    });
    expect(screen.getByTestId("safety-hos-create-violation-link").getAttribute("href")).toBe("/safety/hos-violations");
  });

  it("lists near-violation alerts with drill-down to driver HOS", async () => {
    render(wrap(<HoursOfServicePage operatingCompanyId={companyId} />));
    const drilldown = await screen.findByTestId("safety-hos-drilldown-driver-on");
    expect(drilldown.getAttribute("href")).toBe("/drivers/driver-on/hos");
    expect(screen.getByTestId("safety-hos-near-violations").textContent).toContain("On Duty");
  });
});
