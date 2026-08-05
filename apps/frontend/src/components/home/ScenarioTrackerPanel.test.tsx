import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as homeApi from "../../api/home";
import { ScenarioTrackerPanel } from "./ScenarioTrackerPanel";

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const mockTrackerResponse: homeApi.HomeScenarioTrackerResult = {
  generated_at_utc: new Date().toISOString(),
  generated_at_ct: "2026-08-04 15:42:11 America/Chicago",
  tz_label: "CT",
  max_age_seconds: 20,
  entity_scope: "91e0bf0a-133f-4ce8-a734-2586cfa66d96",
  hops: [
    {
      key: "hop.book",
      title: "Book the load",
      lane: "screens",
      stage: "merged",
      state: "go",
      evidence: "primitives present on prod",
      je: "— (proforma invoice is a non-posting projection)",
      spec_ref: "WIRE-01",
    },
  ],
  scenarios: [],
  source_health: [
    {
      source: "mdata.loads",
      ok: true,
      probed_at_ct: "2026-08-04 15:42:11 America/Chicago",
    },
  ],
};

describe("ScenarioTrackerPanel", () => {
  it("renders the live tracker pipeline and source health", async () => {
    vi.spyOn(homeApi, "fetchHomeScenarioTracker").mockResolvedValue(mockTrackerResponse);

    render(<ScenarioTrackerPanel companyId="91e0bf0a-133f-4ce8-a734-2586cfa66d96" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText("End-to-End Scenario Tracker")).toBeInTheDocument();
    });

    expect(screen.getByText("Book the load")).toBeInTheDocument();
    expect(screen.getByText(/Live as of/)).toBeInTheDocument();
    expect(screen.getByText("mdata.loads")).toBeInTheDocument();
  });

  it("shows a stale banner when a source is unhealthy", async () => {
    vi.spyOn(homeApi, "fetchHomeScenarioTracker").mockResolvedValue({
      ...mockTrackerResponse,
      source_health: [
        {
          source: "driver_finance.driver_pay_rates",
          ok: false,
          probed_at_ct: "2026-08-04 15:42:11 America/Chicago",
          detail: "relation not found on prod",
        },
      ],
    });

    render(<ScenarioTrackerPanel companyId="91e0bf0a-133f-4ce8-a734-2586cfa66d96" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText(/STALE/)).toBeInTheDocument();
    });
  });

  // P0 REGRESSION GUARD (2026-08-05): `[...data.hops, ...data.scenarios]` was spread unguarded.
  // audit.scenario_status is empty on prod (0 is_current rows), so the payload arrived without these
  // arrays, the spread threw `TypeError: i.scenarios is not iterable`, and because this panel mounts
  // unconditionally in OwnerHome the throw escaped to the page error boundary and took the ENTIRE
  // owner homepage down in production. A missing slice must degrade this panel to empty, never crash.
  it("renders without throwing when the payload omits hops/scenarios (P0: owner homepage crash)", async () => {
    vi.spyOn(homeApi, "fetchHomeScenarioTracker").mockResolvedValue({
      ...mockTrackerResponse,
      hops: undefined,
      scenarios: undefined,
    } as unknown as homeApi.HomeScenarioTrackerResult);

    render(<ScenarioTrackerPanel companyId="91e0bf0a-133f-4ce8-a734-2586cfa66d96" />, {
      wrapper: createWrapper(),
    });

    // The assertion is that rendering settles at all — an unguarded spread throws during useMemo and
    // fails this test before any query below it can run.
    await waitFor(() => {
      expect(screen.queryByText(/Scenario/i)).toBeTruthy();
    });
  });
});
