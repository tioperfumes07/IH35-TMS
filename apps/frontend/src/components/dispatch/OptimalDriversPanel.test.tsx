import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { OptimalDriversPanel } from "./OptimalDriversPanel";
import { DEFAULT_DISPATCH_LOCAL_SETTINGS } from "../../lib/dispatch-local-settings";

const sampleDrivers = [
  {
    driver_id: "00000000-0000-4000-8000-000000000010",
    display_name: "Alex Rivera",
    display_id: "d10",
    rank: 1,
    total_score: 92,
    breakdown: {
      hos_score: 95,
      proximity_score: 88,
      eligibility_score: 100,
      performance_score: 85,
      deadhead_penalty: 4,
    },
    hos_safe: true,
    distance_to_pickup_miles: 22,
    eligible: true,
    ineligible_reason: null,
  },
  {
    driver_id: "00000000-0000-4000-8000-000000000011",
    display_name: "Blake Chen",
    display_id: "d11",
    rank: 2,
    total_score: 71,
    breakdown: {
      hos_score: 60,
      proximity_score: 70,
      eligibility_score: 80,
      performance_score: 75,
      deadhead_penalty: 8,
    },
    hos_safe: false,
    distance_to_pickup_miles: 45,
    eligible: true,
    ineligible_reason: null,
  },
];

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe("OptimalDriversPanel (B21-D8)", () => {
  it("renders ranked drivers with score breakdown", () => {
    wrap(
      <OptimalDriversPanel
        loadId="00000000-0000-4000-8000-000000000001"
        operatingCompanyId="00000000-0000-4000-8000-000000000002"
        selectedDriverId=""
        onSelectDriver={vi.fn()}
        driversOverride={sampleDrivers}
      />
    );
    expect(screen.getByTestId("optimal-drivers-panel")).toBeInTheDocument();
    expect(screen.getByText(/Alex Rivera/)).toBeInTheDocument();
    expect(screen.getByText(/HOS 95/)).toBeInTheDocument();
    expect(screen.getByText(/92 pts/)).toBeInTheDocument();
  });

  it("selects a ranked driver on row click", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const companyId = "00000000-0000-4000-8000-000000000002";
    wrap(
      <OptimalDriversPanel
        loadId="00000000-0000-4000-8000-000000000001"
        operatingCompanyId={companyId}
        selectedDriverId=""
        onSelectDriver={onSelect}
        driversOverride={sampleDrivers}
        routingSettingsOverride={{ ...DEFAULT_DISPATCH_LOCAL_SETTINGS, auto_routing_respect_hos: false }}
      />
    );
    await user.click(screen.getByTestId("optimal-driver-row-2"));
    expect(onSelect).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000011");
  });

  it("applies each company auto-routing rule to the mounted optimizer", async () => {
    const user = userEvent.setup();
    const companyId = "00000000-0000-4000-8000-000000000099";
    const onSelect = vi.fn();
    const strictSettings = { ...DEFAULT_DISPATCH_LOCAL_SETTINGS, auto_routing_enabled: true, auto_routing_respect_hos: true, auto_routing_respect_equipment: true };
    const view = wrap(
      <OptimalDriversPanel loadId="00000000-0000-4000-8000-000000000001" operatingCompanyId={companyId} selectedDriverId="" onSelectDriver={onSelect} driversOverride={sampleDrivers} routingSettingsOverride={strictSettings} />
    );
    expect(screen.getByTestId("optimal-driver-row-2").getAttribute("aria-disabled")).toBe("true");
    await user.click(screen.getByTestId("optimal-driver-row-2"));
    expect(onSelect).not.toHaveBeenCalled();

    view.rerender(
      <MemoryRouter><QueryClientProvider client={new QueryClient()}><OptimalDriversPanel loadId="00000000-0000-4000-8000-000000000001" operatingCompanyId={companyId} selectedDriverId="" onSelectDriver={onSelect} driversOverride={sampleDrivers} routingSettingsOverride={{ ...strictSettings, auto_routing_respect_hos: false }} /></QueryClientProvider></MemoryRouter>
    );
    await user.click(screen.getByTestId("optimal-driver-row-2"));
    expect(onSelect).toHaveBeenCalledWith(sampleDrivers[1].driver_id);
  });

  it("shows override warning when non-top driver selected without override flag", async () => {
    const user = userEvent.setup();
    wrap(
      <OptimalDriversPanel
        loadId="00000000-0000-4000-8000-000000000001"
        operatingCompanyId="00000000-0000-4000-8000-000000000002"
        selectedDriverId="00000000-0000-4000-8000-000000000011"
        onSelectDriver={vi.fn()}
        driversOverride={sampleDrivers}
      />
    );
    expect(screen.getByText(/not the top-ranked suggestion/i)).toBeInTheDocument();
    await user.click(screen.getByTestId("optimal-drivers-override"));
    expect(screen.queryByText(/not the top-ranked suggestion/i)).not.toBeInTheDocument();
  });
});
