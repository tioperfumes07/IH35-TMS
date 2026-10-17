import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// LEAD 443.192 (14:05Z) owner law: "pay miles (Short) are NEVER filled from Google or historical (Google/historical are for
// estimates, not pay miles); preview shows short only; refuse without short = CONFIRMED correct."
vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80" }),
}));
vi.mock("../../../components/Toast", () => ({ useToast: () => ({ pushToast: vi.fn() }) }));
vi.mock("../../../api/client", () => ({ apiRequest: vi.fn(() => new Promise(() => undefined)) }));
// The searchable state combobox is replaced by a plain input so the test can set a lane.
vi.mock("../../../components/forms/StateSelect", () => ({
  StateSelect: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <input aria-label={placeholder ?? "State"} data-testid="mock-state" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const rec = (value: number | null) => ({
  current: null,
  historical: null,
  historical_missing_reason: "no history for this lane",
  google: value == null ? null : { value, fetched_at: "2026-10-17T00:00:00Z" },
  google_missing_reason: value == null ? "Google had no route" : null,
  difference: null,
  default_source: value == null ? null : ("google" as const),
});
const postMilesRecommendations = vi.fn(async () => ({
  load_id: null,
  fields: { practical: rec(800), short: rec(777), empty: rec(null) },
}));
vi.mock("../../../api/milesRecommendations", async (orig) => ({
  ...(await orig<typeof import("../../../api/milesRecommendations")>()),
  postMilesRecommendations: () => postMilesRecommendations(),
}));

import { SettlementCreatorDrawer } from "../SettlementCreatorDrawer";
import { creatorDrawerPayMiles, fillEstimateMilesFromRecommendations } from "../creatorDrawerMiles";

function renderDrawer() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SettlementCreatorDrawer open onClose={() => undefined} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Settlement Creator — Short (pay) miles are never auto-filled (443.192)", () => {
  it("a lane's Google recommendation fills Loaded mi (co) but leaves Short mi (pay) empty, and the driver salary shows —", async () => {
    renderDrawer();
    fireEvent.change(await screen.findByTestId("sc-load-pickup-city-0"), { target: { value: "Laredo" } });
    fireEvent.change(screen.getByTestId("sc-load-delivery-city-0"), { target: { value: "Dallas" } });
    const states = screen.getAllByTestId("mock-state");
    fireEvent.change(states[0]!, { target: { value: "TX" } });
    fireEvent.change(states[1]!, { target: { value: "TX" } });

    await waitFor(() => expect(postMilesRecommendations).toHaveBeenCalled());
    // The estimate field (practical) still takes the engine's value — the effect ran.
    await waitFor(() => expect((screen.getByTestId("sc-load-loaded-miles-0") as HTMLInputElement).value).toBe("800"));
    // Short (pay) miles: never from Google / Historical.
    expect((screen.getByTestId("sc-load-short-miles-0") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("sc-drv-short-miles-0") as HTMLInputElement).value).toBe("");
    // No short miles = no pay miles: the salary is "—", never priced on the 800 loaded miles nor a fabricated $0.00.
    expect(screen.getByTestId("sc-total-driver-salary-pay-").textContent).toContain("—");
  });
});

describe("creatorDrawerMiles helpers (443.192)", () => {
  const full = { load_id: null, fields: { practical: rec(800), short: rec(777), empty: rec(55) } };

  it("fills empty Practical / Empty estimates but never Short", () => {
    const out = fillEstimateMilesFromRecommendations(
      { loaded_miles: null, line_haul_miles: null, miles_shortest: null, empty_miles: null },
      full,
    );
    expect(out).toEqual({ loaded_miles: 800, line_haul_miles: 800, miles_shortest: null, empty_miles: 55 });
  });

  it("never overwrites a document value", () => {
    const row = { loaded_miles: 812, line_haul_miles: 812, miles_shortest: 790, empty_miles: 40 };
    expect(fillEstimateMilesFromRecommendations(row, full)).toBe(row);
  });

  it("pay miles are SHORT only — no loaded / practical fallback", () => {
    expect(creatorDrawerPayMiles({ miles_shortest: 790 })).toBe(790);
    expect(creatorDrawerPayMiles({ miles_shortest: null })).toBeNull();
    expect(creatorDrawerPayMiles({ miles_shortest: 0 })).toBeNull();
    expect(creatorDrawerPayMiles({ miles_shortest: null, loaded_miles: 800 } as { miles_shortest: null })).toBeNull();
  });
});
