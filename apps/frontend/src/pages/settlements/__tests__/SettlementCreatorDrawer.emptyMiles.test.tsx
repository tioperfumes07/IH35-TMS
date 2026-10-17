import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// LEAD RULING 15:10Z #2: "Empty (deadhead) miles: Settlement Creator = the signed document's empty miles ONLY (document decides
// pay); never auto-filled from the engine; blank when the document has none."
vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80" }),
}));
vi.mock("../../../components/Toast", () => ({ useToast: () => ({ pushToast: vi.fn() }) }));
vi.mock("../../../api/client", () => ({ apiRequest: vi.fn(() => new Promise(() => undefined)) }));
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
// The engine HAS an Empty (deadhead) recommendation — the drawer must still leave Empty mi blank.
const postMilesRecommendations = vi.fn(async () => ({
  load_id: null,
  fields: { practical: rec(800), short: rec(777), empty: rec(55) },
}));
vi.mock("../../../api/milesRecommendations", async (orig) => ({
  ...(await orig<typeof import("../../../api/milesRecommendations")>()),
  postMilesRecommendations: () => postMilesRecommendations(),
}));

import { SettlementCreatorDrawer } from "../SettlementCreatorDrawer";

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

describe("Settlement Creator — Empty (deadhead) miles are never auto-filled (Lead 15:10Z #2)", () => {
  it("a lane's Google Empty recommendation (55) leaves Empty mi blank on both the company and driver side", async () => {
    renderDrawer();
    fireEvent.change(await screen.findByTestId("sc-load-pickup-city-0"), { target: { value: "Laredo" } });
    fireEvent.change(screen.getByTestId("sc-load-delivery-city-0"), { target: { value: "Dallas" } });
    const states = screen.getAllByTestId("mock-state");
    fireEvent.change(states[0]!, { target: { value: "TX" } });
    fireEvent.change(states[1]!, { target: { value: "TX" } });

    await waitFor(() => expect(postMilesRecommendations).toHaveBeenCalled());
    // The effect ran: the Practical estimate took the engine's value.
    await waitFor(() => expect((screen.getByTestId("sc-load-loaded-miles-0") as HTMLInputElement).value).toBe("800"));
    // Empty (deadhead) miles: the document's only — blank, never the engine's 55.
    expect((screen.getByTestId("sc-load-empty-miles-0") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("sc-drv-empty-miles-0") as HTMLInputElement).value).toBe("");
  });

});
