import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FleetHosBoardSection, num } from "./FleetHosBoardSection";

const getFleetLocationHos = vi.fn();

vi.mock("../../api/reports", () => ({
  getFleetLocationHos: (...args: unknown[]) => getFleetLocationHos(...args),
  downloadFleetLocationHosXlsx: vi.fn(),
}));

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FleetHosBoardSection operatingCompanyId="11111111-1111-4111-8111-111111111111" />
    </QueryClientProvider>
  );
}

describe("num() coercion (regression: e.toFixed is not a function)", () => {
  it("coerces string-typed numerics (the node-postgres numeric shape) instead of throwing", () => {
    // node-postgres returns numeric columns as strings — the exact value that crashed the section.
    expect(num("5.0" as unknown as number)).toBe("5");
    expect(num("295.00" as unknown as number, 0)).toBe("295");
    expect(num(5)).toBe("5");
    expect(num(null)).toBe("—");
    expect(num("" as unknown as number)).toBe("—");
    expect(num("not-a-number" as unknown as number)).toBe("—");
  });
});

describe("FleetHosBoardSection", () => {
  it("renders the real (STRING-typed) fleet row without throwing the section", async () => {
    // The live fleet-location-hos row shape GUARD captured: speed/lat/lng/heading come back as STRINGS.
    getFleetLocationHos.mockResolvedValueOnce({
      generated_at: "2026-06-19T19:00:00Z",
      count: 1,
      rows: [
        {
          unit_id: "u-1",
          unit_number: "T139",
          samsara_vehicle_id: "v-1",
          driver_id: "d-1",
          driver_name: "GERARDO URBINA",
          lat: "27.6562230",
          lng: "-99.6336290",
          city: "Laredo",
          state: "TX",
          formatted_location: "Laredo, TX",
          speed_mph: "62.0",
          heading_deg: "295.00",
          engine_state: "On",
          captured_at_utc: "2026-06-19T18:55:00Z",
          captured_at_local: "06/19/2026 13:55",
          minutes_since_fix: 3,
          stale: false,
          drive_remaining_min: 660,
          window_remaining_min: 840,
          break_remaining_min: 480,
          cycle_remaining_min: 4200,
          hos_status: "ok",
        },
      ],
    });

    renderSection();

    // If .toFixed had been called on the string speed, the section would have thrown and this would never render.
    expect(await screen.findByText("GERARDO URBINA")).toBeInTheDocument();
    expect(screen.getByText("T139")).toBeInTheDocument();
    expect(screen.getByText("62")).toBeInTheDocument(); // speed_mph "62.0" -> num -> "62"
    expect(screen.getByText("295")).toBeInTheDocument(); // heading_deg "295.00" -> num -> "295"
    expect(screen.getByText("11:00")).toBeInTheDocument(); // drive_remaining 660 -> hmm
  });
});
