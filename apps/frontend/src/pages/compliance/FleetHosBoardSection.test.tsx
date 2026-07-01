import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  FleetHosBoardSection,
  num,
  isFleetRowOffline,
  partitionFleetByFreshness,
  OFFLINE_STALE_THRESHOLD_MINUTES,
  OFFLINE_STALE_THRESHOLD_DAYS,
} from "./FleetHosBoardSection";
import type { FleetLocationHosRow } from "../../api/reports";

const getFleetLocationHos = vi.fn();

vi.mock("../../api/reports", () => ({
  getFleetLocationHos: (...args: unknown[]) => getFleetLocationHos(...args),
  downloadFleetLocationHosXlsx: vi.fn(),
}));

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FleetHosBoardSection operatingCompanyId="11111111-1111-4111-8111-111111111111" />
      </MemoryRouter>
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

describe("Live Fleet freshness view-model (COMPLIANCE-1)", () => {
  const row = (minutes_since_fix: number | null, unit_number = "T?"): FleetLocationHosRow =>
    ({
      unit_id: `u-${unit_number}`,
      unit_number,
      minutes_since_fix,
    } as unknown as FleetLocationHosRow);

  it("threshold is a single named constant (7 days), not a magic number", () => {
    expect(OFFLINE_STALE_THRESHOLD_DAYS).toBe(7);
    expect(OFFLINE_STALE_THRESHOLD_MINUTES).toBe(7 * 24 * 60);
  });

  it("classifies a unit older than the threshold as offline (excluded from the live list)", () => {
    // T140 last seen 06/22/2022 -> minutes_since_fix ≫ threshold.
    const years = 4 * 365 * 24 * 60;
    expect(isFleetRowOffline(row(years))).toBe(true);
  });

  it("keeps a freshly-reporting unit (3 min ago) in the live list", () => {
    expect(isFleetRowOffline(row(3))).toBe(false);
  });

  it("treats a never-reported unit (null) as offline", () => {
    expect(isFleetRowOffline(row(null))).toBe(true);
  });

  it("partitions the feed: live keeps fresh rows, offline holds stale/never-reported rows", () => {
    const rows = [row(3, "T139"), row(4 * 365 * 24 * 60, "T140"), row(null, "T200"), row(120, "T141")];
    const { live, offline } = partitionFleetByFreshness(rows);
    expect(live.map((r) => r.unit_number)).toEqual(["T139", "T141"]);
    expect(offline.map((r) => r.unit_number)).toEqual(["T140", "T200"]);
    // The stale unit must NOT appear in the default live list.
    expect(live.some((r) => r.unit_number === "T140")).toBe(false);
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
