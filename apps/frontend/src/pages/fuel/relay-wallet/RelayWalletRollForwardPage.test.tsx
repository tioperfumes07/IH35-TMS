import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as relayApi from "../../../api/relay";
import { RelayWalletRollForwardPage } from "./RelayWalletRollForwardPage";

// ROUND 443.29 c: the owner opens the roll-forward; every number opens the documents behind it.

vi.mock("../../../contexts/CompanyContext", () => ({ useCompanyContext: () => ({ selectedCompanyId: "co-1" }) }));

const data: relayApi.RelayRollForward = {
  totals: { deposits_cents: 12110000, deposit_fees_cents: 393576, fills_cents: 11737099, fill_fees_cents: 51300, lumper_cents: 26500, balance_cents: 295101 },
  days: [
    {
      day: "2026-08-03", deposits_cents: 120000, deposit_fees_cents: 3900, fills_cents: 61356, fill_fees_cents: 400, lumper_cents: 0, balance_cents: 58244,
      deposits: [{ id: "d1", ref: "txn_DEP1", cents: 120000 }], fills: [{ id: "f1", ref: "txn_FILL1", cents: 30878 }, { id: "f2", ref: "txn_FILL2", cents: 30878 }], lumper: [],
    },
  ],
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <RelayWalletRollForwardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("RelayWalletRollForwardPage (443.29 c)", () => {
  it("shows the totals that tie to the owner's file", async () => {
    vi.spyOn(relayApi, "getRelayWalletRollForward").mockResolvedValue(data);
    renderPage();
    const totals = await screen.findByTestId("relay-wallet-totals");
    expect(totals.textContent).toContain("121,100.00");
    expect(totals.textContent).toContain("117,370.99");
    expect(totals.textContent).toContain("2,951.01");
  });
  it("a deposit number opens the deposits behind it", async () => {
    vi.spyOn(relayApi, "getRelayWalletRollForward").mockResolvedValue(data);
    renderPage();
    fireEvent.click(await screen.findByTestId("relay-wallet-open-deposits-2026-08-03"));
    expect(await screen.findByText("txn_DEP1")).toBeTruthy();
  });
  it("a load error is shown, never an empty wallet", async () => {
    vi.spyOn(relayApi, "getRelayWalletRollForward").mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByText(/could not be loaded/i)).toBeTruthy();
  });
});
