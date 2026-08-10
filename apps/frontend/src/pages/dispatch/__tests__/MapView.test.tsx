import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapView } from "../MapView";

/**
 * DISP-S23: /dispatch/map renders, is entity-scoped, and shows an honest empty state.
 *
 * No map SDK is wired yet (DISPATCH_MAP_PROVIDER_WIRED = false in
 * lib/dispatch-map-provider.ts), so the "map provider not configured" section is the surface's
 * permanent, always-on honest-empty container today — inside it, the GPS-positions count is named
 * explicitly (zero vs non-zero vs error), never a bare/blank number.
 */

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: companyId }),
}));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("MapView (DISP-S23)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        expect(String(url)).toContain(`operating_company_id=${companyId}`);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ positions: [] }),
        });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders without a blank frame and scopes the GPS-positions fetch to the active company", async () => {
    wrap(<MapView />);
    expect(await screen.findByTestId("dispatch-map-view")).toBeTruthy();
    expect(screen.getByTestId("dispatch-map-not-configured")).toBeTruthy();
    expect(fetch).toHaveBeenCalled();
  });

  it("shows a named honest-empty state (not a bare zero) when there are no in-transit GPS positions", async () => {
    wrap(<MapView />);
    expect(await screen.findByText("No in-transit loads with GPS right now.")).toBeTruthy();
  });

  it("names the non-zero GPS state without fabricating map pins", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            positions: [
              { load_uuid: "l1", driver_uuid: "d1", lat: 1, lng: 2, speed_mph: 55, stale: false },
            ],
          }),
      })
    );
    wrap(<MapView />);
    expect(await screen.findByText(/1 active load with GPS/)).toBeTruthy();
  });

  it("surfaces a fetch failure honestly instead of a silent blank", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    wrap(<MapView />);
    expect(await screen.findByText(/Could not load GPS positions/)).toBeTruthy();
  });
});
