import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as dispatchApi from "../../../api/dispatch";
import { AtRiskQueuePage } from "../AtRiskQueuePage";

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

describe("AtRiskQueuePage", () => {
  beforeEach(() => {
    vi.spyOn(dispatchApi, "listAtRiskOrLateDispatchLoads").mockResolvedValue({
      loads: [
        {
          id: "load-1",
          load_number: "L-1001",
          status: "in_transit",
          customer_id: "customer-1",
          unit_id: "unit-1",
          driver_id: "driver-1",
          customer_name: "Acme Freight",
          unit_number: "T169",
          driver_name: "Jane Driver",
          latest_eta_prediction: { confidence_class: "late", variance_minutes: 45 },
          next_stop_scheduled_at: "2026-07-20T18:00:00.000Z",
          delivery_city: "Houston",
          delivery_state: "TX",
          is_at_risk: true,
          is_late: false,
        },
      ],
      count: 1,
      at_risk_count: 1,
      late_count: 0,
      grace_minutes: 30,
    });
  });

  it("renders at-risk rows with EntityLink load drill-through", async () => {
    wrap(<AtRiskQueuePage />);
    const link = await screen.findByRole("link", { name: "L-1001" });
    expect(link.getAttribute("href")).toBe("/dispatch/loads/load-1");
    expect(screen.getByRole("link", { name: "Acme Freight" }).getAttribute("href")).toBe("/customers/customer-1");
    expect(screen.getByRole("link", { name: "Jane Driver" }).getAttribute("href")).toBe("/drivers/driver-1");
    expect(screen.getByRole("link", { name: "T169" }).getAttribute("href")).toBe("/fleet/units/unit-1");
  });

  it("renders unavailable related identities as non-interactive tombstones", async () => {
    vi.spyOn(dispatchApi, "listAtRiskOrLateDispatchLoads").mockResolvedValue({
      loads: [
        {
          id: "load-orphan",
          load_number: "",
          status: "in_transit",
          customer_id: "customer-orphan",
          unit_id: "unit-orphan",
          driver_id: "driver-orphan",
          customer_name: null,
          unit_number: null,
          driver_name: null,
          latest_eta_prediction: null,
          next_stop_scheduled_at: null,
          delivery_city: null,
          delivery_state: null,
          is_at_risk: false,
          is_late: true,
        },
      ],
      count: 1,
      at_risk_count: 0,
      late_count: 1,
      grace_minutes: 30,
    });

    wrap(<AtRiskQueuePage />);
    expect(await screen.findByText("Load — not visible")).toBeTruthy();
    expect(screen.getByText("Customer — not visible")).toBeTruthy();
    expect(screen.getByText("Driver — not visible")).toBeTruthy();
    expect(screen.getByText("Unit — not visible")).toBeTruthy();
    expect(screen.queryAllByRole("link")).toHaveLength(1); // Dispatch Home only.
  });

  it("surfaces query failures via ListErrorState (not false-empty)", async () => {
    const user = userEvent.setup();
    const listSpy = vi
      .spyOn(dispatchApi, "listAtRiskOrLateDispatchLoads")
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ loads: [], count: 0, at_risk_count: 0, late_count: 0, grace_minutes: 30 });

    wrap(<AtRiskQueuePage />);
    expect(await screen.findByText("Couldn't load at-risk queue")).toBeTruthy();
    expect(screen.getByText(/network down/)).toBeTruthy();
    expect(screen.queryByText("No at-risk or late loads right now.")).toBeNull();

    const callsBeforeRetry = listSpy.mock.calls.length;
    await user.click(screen.getByRole("button", { name: /Retry/i }));
    expect(await screen.findByText("No at-risk or late loads right now.")).toBeTruthy();
    expect(listSpy.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
  });
});
