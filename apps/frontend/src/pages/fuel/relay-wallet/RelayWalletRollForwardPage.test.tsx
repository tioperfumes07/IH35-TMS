import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    // LEAD 443.266-C (CC-2): the totals render as the V3 KPI strip since 443.250 (5c3b4b32d8 removed the
    // relay-wallet-totals block, same totals object). Every tile is checked against the owner's file, to the cent
    // (Relay-All-Transactions-2026-10-10.csv: 121,100.00 / 3,935.76 / 117,370.99 / 513.00 / 265.00 / balance 2,951.01).
    const tile = (id: string) => screen.getByTestId(`relay-wallet-kpi-${id}`).textContent ?? "";
    await waitFor(() => expect(tile("deposits")).toContain("121,100.00"));
    expect(tile("deposit-fees")).toContain("3,935.76");
    expect(tile("fills")).toContain("117,370.99");
    expect(tile("fill-fees")).toContain("513.00");
    expect(tile("lumper")).toContain("265.00");
    expect(tile("balance")).toContain("2,951.01");
    // The balance tile is the roll-forward identity: deposits − fills − fill fees − lumper (the deposit fee is the card's).
    const t = data.totals;
    expect(t.deposits_cents - t.fills_cents - t.fill_fees_cents - t.lumper_cents).toBe(t.balance_cents);
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
