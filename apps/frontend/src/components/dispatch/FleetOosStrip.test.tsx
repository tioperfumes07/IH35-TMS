import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as mdataApi from "../../api/mdata";
import * as maintenanceApi from "../../api/maintenance";
import { FleetOosStrip } from "./FleetOosStrip";

vi.mock("../../api/mdata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/mdata")>();
  return { ...actual, listUnits: vi.fn() };
});

vi.mock("../../api/maintenance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/maintenance")>();
  return { ...actual, listSevereRepairEstimates: vi.fn() };
});

function wrap(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </MemoryRouter>
  );
}

// PACKET-C (Fleet OOS/in-shop columns, 2026-09-03): OOS since / Days OOS / Location must render the
// REAL recorded value when present, and a plain em dash -- never an invented placeholder -- when the
// unit never recorded one.
describe("FleetOosStrip OOS since / days OOS / location columns (PACKET-C)", () => {
  it("renders the real date/days/location for a unit that has them, and an em dash for one that doesn't", async () => {
    vi.mocked(mdataApi.listUnits).mockResolvedValue({
      units: [
        {
          id: "unit-with-data",
          unit_number: "T-501",
          status: "OutOfService",
          is_oos: true,
          oos_reason: "Blown head gasket",
          oos_since: "2026-08-20T00:00:00.000Z",
          oos_location: "Dallas shop",
        },
        {
          id: "unit-no-data",
          unit_number: "T-502",
          status: "InMaintenance",
          is_oos: false,
          oos_reason: null,
          oos_since: null,
          oos_location: null,
        },
      ],
      total: 2,
    });
    vi.mocked(maintenanceApi.listSevereRepairEstimates).mockResolvedValue({ data: [] });

    render(wrap(<FleetOosStrip operatingCompanyId="company-1" />));

    expect(await screen.findByText("T-501")).toBeInTheDocument();
    expect(screen.getByText("T-502")).toBeInTheDocument();

    const since = screen.getAllByTestId("fleet-oos-since");
    const days = screen.getAllByTestId("fleet-oos-days");
    const location = screen.getAllByTestId("fleet-oos-location");
    expect(since).toHaveLength(2);
    expect(days).toHaveLength(2);
    expect(location).toHaveLength(2);

    // T-501 (real oos_since/oos_location): a real date, a non-dash day count, "Dallas shop".
    const t501 = since.find((el) => el.textContent !== "—");
    expect(t501).toBeTruthy();
    expect(days.some((el) => el.textContent !== "—" && el.textContent !== "")).toBe(true);
    expect(location.map((el) => el.textContent)).toContain("Dallas shop");

    // T-502 (no oos_since/oos_location recorded): em dash, never an invented value.
    expect(since.some((el) => el.textContent === "—")).toBe(true);
    expect(days.some((el) => el.textContent === "—")).toBe(true);
    expect(location.some((el) => el.textContent === "—")).toBe(true);
  });
});
