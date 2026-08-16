import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FixedAssetsPage, parseOwnerPricesJson } from "./FixedAssetsPage";
import * as faApi from "../../api/fixed-assets";
import * as flagHook from "../../hooks/useFeatureFlag";
import * as companyCtx from "../../contexts/CompanyContext";

const TRK_ID = "trk-id-1";
const TRK_COMPANIES = [{ id: TRK_ID, code: "TRK", legal_name: "TRK Holdings", short_name: "TRK", company_type: "asset_holder", is_active: true, is_default: false }];

// LV-USMCA-FIXED-ASSETS-TRK-BULK-REGISTER — selectedCompanyId must equal the TRK company id.
// Bulk-register is a TRK-books action and is now gated on TRK being the SELECTED entity, not
// merely existing somewhere in `companies` (see FixedAssetsPage.tsx canBulkRegister). Mocked as a
// vi.fn() (default TRK selected) so individual tests can override to a non-TRK entity.
vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: vi.fn(() => ({ selectedCompanyId: TRK_ID, companies: TRK_COMPANIES })),
}));

vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "Owner" }, isLoading: false, isUnauthenticated: false, refetch: vi.fn() }),
}));

vi.mock("../../api/fixed-assets", () => ({
  getFixedAssets: vi.fn(),
  getFixedAssetDetail: vi.fn(),
  registerTrkOwnedUnits: vi.fn(),
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

describe("parseOwnerPricesJson", () => {
  it("rejects empty input", () => {
    expect(parseOwnerPricesJson("").ok).toBe(false);
  });

  it("accepts a valid unit_number → cents map", () => {
    const result = parseOwnerPricesJson('{"T169": 85000000}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.map.T169).toBe(85000000);
  });

  it("rejects non-positive cents", () => {
    expect(parseOwnerPricesJson('{"T169": 0}').ok).toBe(false);
  });
});

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
    expect(await screen.findByTestId("fa-density-honesty-banner")).toBeTruthy();
  });

  it("hides Register TRK units when a non-TRK entity is selected (LV-USMCA-FIXED-ASSETS-TRK-BULK-REGISTER)", async () => {
    vi.mocked(companyCtx.useCompanyContext).mockReturnValueOnce({
      selectedCompanyId: "usmca-id-1",
      companies: [...TRK_COMPANIES, { id: "usmca-id-1", code: "USMCA", legal_name: "USMCA Carrier", short_name: "USMCA", company_type: "operating_carrier", is_active: true, is_default: false }],
    } as ReturnType<typeof companyCtx.useCompanyContext>);
    vi.mocked(flagHook.useFeatureFlag).mockReturnValue({ enabled: true, loading: false, error: null });
    vi.mocked(faApi.getFixedAssets).mockResolvedValue({ total: 0, limit: 50, offset: 0, items: [] });

    render(wrap(<FixedAssetsPage />));
    await waitFor(() => expect(faApi.getFixedAssets).toHaveBeenCalled());

    expect(screen.queryByTestId("fa-open-trk-register")).toBeNull();
  });

  it("does not submit bulk register without owner prices", async () => {
    vi.mocked(flagHook.useFeatureFlag).mockReturnValue({ enabled: true, loading: false, error: null });
    vi.mocked(faApi.getFixedAssets).mockResolvedValue({ total: 0, limit: 50, offset: 0, items: [] });

    render(wrap(<FixedAssetsPage />));
    await waitFor(() => expect(faApi.getFixedAssets).toHaveBeenCalled());

    fireEvent.click(await screen.findByTestId("fa-open-trk-register"));
    const submit = await screen.findByTestId("fa-register-trk-submit");
    expect(submit.hasAttribute("disabled")).toBe(true);

    fireEvent.change(await screen.findByTestId("fa-prices-json"), { target: { value: '{"T169": 85000000}' } });
    expect(submit.hasAttribute("disabled")).toBe(false);

    fireEvent.click(submit);
    await waitFor(() =>
      expect(faApi.registerTrkOwnedUnits).toHaveBeenCalledWith({
        operating_company_id: "trk-id-1",
        owner_operating_company_id: "trk-id-1",
        pricesByUnitNumber: { T169: 85000000 },
      }),
    );
  });
});
