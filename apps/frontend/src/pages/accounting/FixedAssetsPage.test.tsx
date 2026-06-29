import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FixedAssetsPage } from "./FixedAssetsPage";
import * as faApi from "../../api/fixed-assets";
import * as flagHook from "../../hooks/useFeatureFlag";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91e0bf0a-133f-4ce8-a734-2586cfa66d96" }),
}));

vi.mock("../../api/fixed-assets", () => ({
  getFixedAssets: vi.fn(),
  getFixedAssetDetail: vi.fn(),
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

describe("FixedAssetsPage", () => {
  afterEach(cleanup);

  it("shows the disabled state when FIXED_ASSETS_ENABLED is off (no data fetch)", async () => {
    vi.mocked(flagHook.useFeatureFlag).mockReturnValue({ enabled: false, loading: false, error: null });

    render(wrap(<FixedAssetsPage />));

    expect(await screen.findByText(/not yet enabled/i)).toBeTruthy();
    expect(faApi.getFixedAssets).not.toHaveBeenCalled();
  });

  it("renders the asset register when the flag is enabled", async () => {
    vi.mocked(flagHook.useFeatureFlag).mockReturnValue({ enabled: true, loading: false, error: null });
    vi.mocked(faApi.getFixedAssets).mockResolvedValue({
      total: 1, limit: 50, offset: 0,
      items: [{
        id: "fa1", asset_number: "T-100", name: "2022 Freightliner Cascadia",
        owner_operating_company_id: "owner1", owner_company_name: "TRK Holdings", is_owner_operated: false,
        class_id: "c1", class_name: "Tractors",
        purchase_price_cents: 12000000, salvage_value_cents: 2000000,
        purchase_date: "2022-01-01", in_service_date: "2022-01-01",
        method: "straight_line", useful_life_months: 60, convention: "half_month",
        status: "active", created_at: "2022-01-01",
        depreciation_to_date_cents: 4000000, net_book_value_cents: 8000000,
      }],
    });

    render(wrap(<FixedAssetsPage />));

    await waitFor(() => expect(faApi.getFixedAssets).toHaveBeenCalled());
    expect(await screen.findByText("2022 Freightliner Cascadia")).toBeTruthy();
    expect(await screen.findByText("Tractors")).toBeTruthy();
    expect(await screen.findByText("TRK Holdings")).toBeTruthy();
  });
});
