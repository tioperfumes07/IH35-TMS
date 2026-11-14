import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FleetHealthLineBoard } from "./FleetHealthLineBoard";
import { readFleetHealth } from "./fleet-health-source";

vi.mock("./fleet-health-source", () => ({ readFleetHealth: vi.fn() }));
const base = { make: "Peterbilt", model: "579", year: 2024, telemetry_at: null, formatted_location: "Laredo, TX", telemetry_city: null, telemetry_state: null, body_style: "aero" as const };
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/maintenance/fleet-table?view=health"]}><FleetHealthLineBoard companyId="company-test" /></MemoryRouter></QueryClientProvider>);
}
describe("Board 43 — Fleet Health Line full page", () => {
  beforeEach(() => { vi.mocked(readFleetHealth).mockReset(); });
  it("renders the board's seven columns, the road bar, next PM odometer and source drills", async () => {
    vi.mocked(readFleetHealth).mockResolvedValue({ kpi: { total: 2 }, units: [
      { ...base, unit_id: "u1", unit_number: "T177", odometer_mi: 12000, speed_mph: 55, pm_schedule_id: "s1", pm_interval: 10000, miles_left: 2000, state: "soon" },
      { ...base, unit_id: "u2", unit_number: "T176", odometer_mi: 40000, speed_mph: 0, pm_schedule_id: null, pm_interval: null, miles_left: null, state: "none" },
    ] });
    mount();
    expect(await screen.findByRole("link", { name: "T177" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fleet Health Line" })).toBeInTheDocument();
    for (const h of ["UNIT", "TRACTOR", "MAKE · MODEL", "NEXT PM", "LOCATION", "STATUS"]) expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "8000");
    expect(screen.getByText("14,000")).toBeInTheDocument();
    const left = screen.getByRole("link", { name: "2,000 to go" }).getAttribute("href") ?? "";
    expect(left).toContain("/maintenance/pm-schedule?schedule_id=s1");
    expect(left).toContain("ret=");
    expect(screen.getByRole("link", { name: "Start PM clock →" }).getAttribute("href") ?? "").toContain("unit_id=u2");
  });
  it("tiles count and filter (Moving 1 → only the moving truck)", async () => {
    vi.mocked(readFleetHealth).mockResolvedValue({ kpi: { total: 2 }, units: [
      { ...base, unit_id: "u1", unit_number: "T177", odometer_mi: 12000, speed_mph: 55, pm_schedule_id: "s1", pm_interval: 10000, miles_left: 2000, state: "soon" },
      { ...base, unit_id: "u2", unit_number: "T176", odometer_mi: 40000, speed_mph: 0, pm_schedule_id: null, pm_interval: null, miles_left: null, state: "none" },
    ] });
    mount();
    await screen.findByRole("link", { name: "T177" });
    fireEvent.click(screen.getByRole("button", { name: /MOVING/ }));
    expect(screen.getByRole("link", { name: "T177" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "T176" })).toBeNull();
  });
  it("shows the read error, never an empty fleet", async () => {
    vi.mocked(readFleetHealth).mockRejectedValue(new Error("offline"));
    mount();
    expect(await screen.findByText("Couldn't load fleet health")).toBeInTheDocument();
    expect(screen.queryByText("No units match this filter.")).toBeNull();
  });
});
