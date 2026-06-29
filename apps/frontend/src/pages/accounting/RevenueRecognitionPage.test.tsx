import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RevenueRecognitionPage } from "./RevenueRecognitionPage";
import * as rrApi from "../../api/revenue-recognition";
import * as flagHook from "../../hooks/useFeatureFlag";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91e0bf0a-133f-4ce8-a734-2586cfa66d96" }),
}));

vi.mock("../../api/revenue-recognition", () => ({
  getRevenueContracts: vi.fn(),
  getRevenueContractDetail: vi.fn(),
}));

vi.mock("../../hooks/useFeatureFlag", () => ({
  useFeatureFlag: vi.fn(),
}));

function wrap(ui: ReactElement) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {ui}
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("RevenueRecognitionPage", () => {
  afterEach(cleanup);

  it("shows the disabled state when REVENUE_RECOGNITION_ENABLED is off (no data fetch)", async () => {
    vi.mocked(flagHook.useFeatureFlag).mockReturnValue({ enabled: false, loading: false, error: null });

    render(wrap(<RevenueRecognitionPage />));

    expect(await screen.findByText(/not yet enabled/i)).toBeTruthy();
    expect(rrApi.getRevenueContracts).not.toHaveBeenCalled();
  });

  it("renders the contracts list when the flag is enabled", async () => {
    vi.mocked(flagHook.useFeatureFlag).mockReturnValue({ enabled: true, loading: false, error: null });
    vi.mocked(rrApi.getRevenueContracts).mockResolvedValue({
      total: 1, limit: 50, offset: 0,
      items: [{
        id: "rc1", contract_number: "C-2026-001", description: "Annual freight services agreement",
        source_type: "subscription", customer_uuid: "cust1",
        transaction_price_cents: 1200000, contract_date: "2026-01-01", start_date: "2026-01-01", end_date: "2026-12-31",
        status: "active", created_at: "2026-01-01",
        recognized_to_date_cents: 500000, deferred_balance_cents: 700000, obligation_count: 1,
      }],
    });

    render(wrap(<RevenueRecognitionPage />));

    await waitFor(() => expect(rrApi.getRevenueContracts).toHaveBeenCalled());
    expect(await screen.findByText("Annual freight services agreement")).toBeTruthy();
    expect(await screen.findByText("C-2026-001")).toBeTruthy();
  });
});
