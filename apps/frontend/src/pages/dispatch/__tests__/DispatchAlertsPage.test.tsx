import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as cashApi from "../../../api/cashAdvanceRequests";
import * as dispatchApi from "../../../api/dispatch";
import * as maintenanceApi from "../../../api/maintenance";
import * as safetyApi from "../../../api/safety";
import { DispatchAlertsPage } from "../DispatchAlertsPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DispatchAlertsPage (B21-D6)", () => {
  beforeEach(() => {
    vi.spyOn(safetyApi, "getSafetyAccidents").mockResolvedValue({ accidents: [] });
    vi.spyOn(cashApi.cashAdvanceRequestsOfficeApi, "list").mockResolvedValue({ requests: [] });
    vi.spyOn(maintenanceApi, "getIntransitTriageQueue").mockResolvedValue({ issues: [] });
    vi.spyOn(dispatchApi, "listLateArrivalDispatchLoads").mockResolvedValue({
      count: 2,
      grace_minutes: 30,
      loads: [
        {
          id: "l1",
          load_number: "LD-200",
          status: "in_transit",
          customer_name: "Acme",
          unit_number: "101",
          driver_name: "Jane Driver",
          latest_eta_prediction: { confidence_class: "late" },
          next_stop_scheduled_at: "2026-06-03T18:00:00.000Z",
          next_stop_city: "Houston",
          next_stop_state: "TX",
          next_stop_type: "delivery",
        },
      ],
    });
  });

  it("shows live late arrivals count from API", async () => {
    wrap(<DispatchAlertsPage />);
    expect(await screen.findByText("2")).toBeTruthy();
    expect(screen.getByText("Late arrivals")).toBeTruthy();
  });

  it("links late arrivals card to drill-down route", async () => {
    wrap(<DispatchAlertsPage />);
    await screen.findByText("2");
    const link = screen.getByRole("link", { name: /Late arrivals/i });
    expect(link.getAttribute("href")).toBe("/dispatch/alerts/late-arrivals");
  });
});
