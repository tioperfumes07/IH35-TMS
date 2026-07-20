import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as dispatchApi from "../../../api/dispatch";
import { LateArrivalsPage } from "../LateArrivalsPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LateArrivalsPage", () => {
  beforeEach(() => {
    vi.spyOn(dispatchApi, "listLateArrivalDispatchLoads").mockResolvedValue({
      count: 1,
      grace_minutes: 30,
      loads: [
        {
          id: "l1",
          load_number: "L-12047",
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

  it("renders load drill-through via EntityLink to /dispatch/loads/:id", async () => {
    wrap(<LateArrivalsPage />);
    const link = await screen.findByTestId("late-arrival-load-l1");
    expect(link.getAttribute("href")).toBe("/dispatch/loads/l1");
    expect(link.textContent).toContain("L-12047");
  });

  it("surfaces query failures via ListErrorBanner (not empty-table false-empty)", async () => {
    vi.spyOn(dispatchApi, "listLateArrivalDispatchLoads").mockRejectedValue(new Error("boom"));
    wrap(<LateArrivalsPage />);
    expect(await screen.findByText("Failed to load late arrivals.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Refresh/i })).toBeTruthy();
    expect(screen.queryByText("No late arrivals right now.")).toBeNull();
  });
});
