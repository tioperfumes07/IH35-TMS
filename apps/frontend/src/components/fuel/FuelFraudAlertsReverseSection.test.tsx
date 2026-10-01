import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FuelFraudAlertsReverseSection } from "./FuelFraudAlertsReverseSection";

const listFuelFraudAlerts = vi.fn();
vi.mock("../../api/fuel-fraud-alerts", () => ({
  listFuelFraudAlerts: (...args: unknown[]) => listFuelFraudAlerts(...args),
}));

function renderSection(filter: { unit_id: string } | { driver_id: string } | { load_id: string } | { vendor_id: string }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FuelFraudAlertsReverseSection operatingCompanyId="usmca" filter={filter} contextLabel="this unit" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("FuelFraudAlertsReverseSection", () => {
  beforeEach(() => listFuelFraudAlerts.mockReset());
  afterEach(cleanup);

  it("renders an alert with severity/status badges and the recovery link", async () => {
    listFuelFraudAlerts.mockResolvedValue({
      alerts: [
        {
          uuid: "a1",
          fuel_transaction_uuid: "ft1",
          rule_id: "VELOCITY_SPIKE",
          severity: "critical",
          detected_at: "2026-09-01T12:00:00.000Z",
          status: "confirmed_fraud",
          transaction_at: "2026-09-01T11:00:00.000Z",
          gallons: 50,
          location_city: "Laredo",
          location_state: "TX",
          unit_id: "u1",
          driver_id: "d1",
          load_id: null,
          vendor_id: "v1",
          total_cost: 250.5,
          recovery_event_id: "ev1",
          recovery_status: "pending_review",
        },
      ],
    });
    renderSection({ unit_id: "u1" });
    await waitFor(() => expect(screen.getByText("VELOCITY_SPIKE")).toBeInTheDocument());
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("Confirmed fraud")).toBeInTheDocument();
    expect(screen.getByText("Pending review")).toBeInTheDocument();
    expect(listFuelFraudAlerts).toHaveBeenCalledWith("usmca", { unit_id: "u1" });
  });

  it("shows an empty state when there are no alerts", async () => {
    listFuelFraudAlerts.mockResolvedValue({ alerts: [] });
    renderSection({ vendor_id: "v1" });
    await waitFor(() => expect(screen.getByText(/No fuel fraud alerts/)).toBeInTheDocument());
  });
});
