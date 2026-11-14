import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FleetHealthLineBoard } from "./FleetHealthLineBoard";
import { toBoardRow } from "./fleet-health-board-rows";
import { readFleetHealth, type FleetHealthRow } from "./fleet-health-source";

vi.mock("./fleet-health-source", () => ({ readFleetHealth: vi.fn() }));
const base = { make: "Peterbilt", model: "579", year: 2024, telemetry_at: null, formatted_location: null, telemetry_city: "Vinton", telemetry_state: "LA" };
const soon: FleetHealthRow = { ...base, unit_id: "u1", unit_number: "T177", odometer_mi: 505542, speed_mph: 55, pm_schedule_id: "s1", pm_interval: 25000, miles_left: 2000, state: "soon" };
const none: FleetHealthRow = { ...base, unit_id: "u2", unit_number: "T176", odometer_mi: 439715, speed_mph: 0, pm_schedule_id: null, pm_interval: null, miles_left: null, state: "none" };
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/maintenance/fleet-table?view=health"]}><FleetHealthLineBoard companyId="company-test" /></MemoryRouter></QueryClientProvider>);
}
describe("Board 43 — Fleet Health Line (Main.dc.html, verbatim port)", () => {
  beforeEach(() => { vi.mocked(readFleetHealth).mockReset(); });
  it("maps rows with the board's own renderVals rules", () => {
    const id = (h: string) => h;
    expect(toBoardRow(soon, id)).toMatchObject({ k: "soon", fillW: 552, sinceLabel: "23,000 mi since PM", leftLabel: "2,000 to go", leftColor: "#C76A0A", status: "PM soon", stBg: "#FDF0DC", stFg: "#7A3E04", cab: "#C76A0A", road: "#D97B16", make: "PETERBILT 579", odo: "505,542 mi · 2024", loc: "Vinton LA", body: "aero", moving: true, alert: true });
    expect(toBoardRow(none, id)).toMatchObject({ k: "none", fillW: 0, sinceLabel: "Last PM not entered", leftLabel: "", nextPm: "—", status: "Enter last PM", alert: false });
    expect(toBoardRow({ ...soon, miles_left: -900 }, id)).toMatchObject({ k: "over", leftLabel: "900 over", nextPm: "Overdue", leftColor: "#C0262D" });
    expect(toBoardRow({ ...soon, miles_left: 20000 }, id)).toMatchObject({ k: "ok", leftColor: "#1F8A4C", status: "Healthy" });
    expect(toBoardRow({ ...soon, model: "389" }, id).body).toBe("classic");
  });
  it("renders the board header, tiles, seven columns, bar and drills", async () => {
    vi.mocked(readFleetHealth).mockResolvedValue({ kpi: { total: 2 }, units: [soon, none] });
    mount();
    expect(await screen.findByRole("link", { name: "T177" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fleet Health Line" })).toHaveStyle({ fontSize: "28px", fontWeight: "800" });
    for (const h of ["UNIT", "TRACTOR", "MAKE · MODEL", "ROAD TO NEXT PM · 0 — 20K PLAN — 25K", "NEXT PM", "LOCATION", "STATUS"]) expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument();
    const tiles = screen.getByTestId("fleet-health-board-tiles").textContent ?? "";
    for (const t of ["0OVERDUE", "1DUE ≤ 2 WK", "0IN SHOP", "1NO PM CLOCK"]) expect(tiles).toContain(t);
    expect(screen.getAllByRole("progressbar")[0]).toHaveAttribute("aria-valuenow", "552");
    expect(screen.getByText("2,000 to go")).toBeInTheDocument();
    const since = screen.getByRole("link", { name: "23,000 mi since PM" }).getAttribute("href") ?? "";
    expect(since).toContain("/maintenance/pm-schedule?schedule_id=s1");
    expect(since).toContain("ret=");
    expect(screen.getByRole("link", { name: "Last PM not entered" }).getAttribute("href") ?? "").toContain("unit_id=u2");
    expect(screen.getByRole("img", { name: "T176 PETERBILT 579, Enter last PM" })).toBeInTheDocument();
  });
  it("shows the read error, never an empty fleet", async () => {
    vi.mocked(readFleetHealth).mockRejectedValue(new Error("offline"));
    mount();
    expect(await screen.findByText("Couldn't load fleet health")).toBeInTheDocument();
    expect(screen.queryByText("No trucks on file.")).toBeNull();
  });
});
