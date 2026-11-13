/**
 * Row 22 — RELAY FEED KPI tile on Banking Home.
 * Verifies:
 *  1. Tile renders with testId banking-kpi-relay-feed.
 *  2. Tile links to /banking/relay-card.
 *  3. Shows primary_label text from the KPI response when fresh (≤ 24h).
 *  4. Shows "Never" when relay_ingest_heartbeat has null value (never ingested).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BankingHomeBoard } from "./BankingHomeBoard";

const mockGetBankingKpiList = vi.fn();

vi.mock("../../../api/banking", () => ({
  getMoneyMap: vi.fn().mockResolvedValue({
    accounts: [],
    totals: { in_cents: 0, out_cents: 0, line_count: 0, pending_review_count: 0 },
  }),
  getBankingTiles: vi.fn().mockResolvedValue({ tiles: [] }),
  getDriftAlerts: vi.fn().mockResolvedValue({ rows: [], total_count: 0 }),
  getPlaidCompanyTransactions: vi.fn().mockResolvedValue({ transactions: [] }),
  getBankingKpiList: (...args: unknown[]) => mockGetBankingKpiList(...args),
}));

function wrap(ui: ReactElement) {
  return (
    <MemoryRouter initialEntries={["/banking"]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {ui}
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("Row 22 BankingHomeBoard RELAY FEED KPI tile", () => {
  afterEach(cleanup);

  it("renders the RELAY FEED tile and links to /banking/relay-card when fresh (2h ago)", async () => {
    mockGetBankingKpiList.mockResolvedValue({
      kpis: [{ key: "relay_ingest_heartbeat", value: 2, primary_label: "2h ago", empty_reason: null }],
    });
    render(wrap(<BankingHomeBoard companyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" />));
    const tile = await screen.findByTestId("banking-kpi-relay-feed");
    await waitFor(() => expect(tile.textContent).toContain("2h ago"));
    const href = tile.getAttribute("href") ?? "";
    expect(href).toContain("/banking/relay-card");
  });

  it("shows Never when relay_ingest_heartbeat has null value (never ingested)", async () => {
    mockGetBankingKpiList.mockResolvedValue({
      kpis: [
        {
          key: "relay_ingest_heartbeat",
          value: null,
          primary_label: "Never",
          empty_reason: "Relay ingest has never run successfully for this company.",
        },
      ],
    });
    render(wrap(<BankingHomeBoard companyId="91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" />));
    const tile = await screen.findByTestId("banking-kpi-relay-feed");
    await waitFor(() => expect(tile.textContent).toContain("Never"));
  });
});
