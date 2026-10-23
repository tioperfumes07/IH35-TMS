import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FleetHealthLine } from "./FleetHealthLine";
import { readFleetHealth } from "./fleet-health-source";

vi.mock("./fleet-health-source", () => ({ readFleetHealth: vi.fn() }));
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><FleetHealthLine companyId="company-test" /></MemoryRouter></QueryClientProvider>);
}
describe("Maintenance Home source drill-through", () => {
  beforeEach(() => { vi.mocked(readFleetHealth).mockReset(); });
  it("links odometer and remaining miles to their unit and PM schedule", async () => {
    vi.mocked(readFleetHealth).mockResolvedValue({ kpi: { total: 1 }, units: [{
      unit_id: "10000000-0000-4000-8000-000000000001", unit_number: "T-EXAMPLE", make: null, model: null, year: null,
      odometer_mi: 12000, telemetry_at: null, formatted_location: null, telemetry_city: null, telemetry_state: null,
      speed_mph: null, pm_schedule_id: "schedule-test", pm_interval: 10000, miles_left: 2000, state: "soon", body_style: "classic",
    }] });
    mount();
    expect(await screen.findByRole("button", { name: "All 1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "12,000 mi" })).toHaveAttribute("href");
    expect(screen.getByRole("link", { name: "2,000 to go" })).toHaveAttribute("href", "/maintenance/pm-schedule?schedule_id=schedule-test");
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "8000");
  });
  it("does not render an empty fleet on a failed read", async () => {
    vi.mocked(readFleetHealth).mockRejectedValue(new Error("offline"));
    mount();
    expect(await screen.findByText("Couldn't load fleet health")).toBeInTheDocument();
    expect(screen.queryByText("No units match this filter.")).not.toBeInTheDocument();
  });
});
