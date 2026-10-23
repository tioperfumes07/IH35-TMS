import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as factoringApi from "../../../api/factoring";
import * as factoringPurchasesApi from "../../../api/factoring-purchases";
import * as dataInfraApi from "../../../api/data-infra";
import * as mdataApi from "../../../api/mdata";
import { FactoringHomePage } from "../FactoringHome";
import { ToastProvider } from "../../../components/Toast";

/**
 * FACT-S01 / ROUND 443.267 board 4: FactoringHomeBoard KPI strip must not paint fabricated
 * $0.00 / 0% when getFactoringSummary fails — ListErrorBanner + "—" on money tiles.
 * Active-factor chrome (FAC-07 DrillKpiCard) is superseded by the approved board.
 */

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: companyId }),
}));

vi.mock("../../../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "Owner" } }),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

function stubHappyPathApis() {
  vi.spyOn(mdataApi, "listVendors").mockResolvedValue({ vendors: [] } as never);
  vi.spyOn(factoringApi, "listFactors").mockResolvedValue({
    factors: [
      {
        id: "factor-profile-1",
        name: "Triumph Business Capital",
        active: true,
        advance_rate: 0.95,
        reserve_rate: 0.05,
        cash_reserve_rate: 0,
        fee_rate: 0.03,
        recourse_days: 95,
      },
    ],
  } as never);
  vi.spyOn(factoringApi, "getFactoringRecoursePipeline").mockResolvedValue({
    invoices: [],
    total: 0,
  } as never);
  vi.spyOn(factoringApi, "getFactoringChargebacksFees").mockResolvedValue({
    history: [],
    monthly_summary: [],
  } as never);
  vi.spyOn(factoringApi, "getFactoringStatementsSettings").mockResolvedValue({
    current: { active_factor_count: 1, single_factor_invariant_ok: true, recourse_days: 95 },
    statements: [],
  } as never);
  vi.spyOn(factoringApi, "scanDuplicateVendors").mockResolvedValue({ pairs: [] } as never);
  vi.spyOn(factoringPurchasesApi, "listFactoringPurchases").mockResolvedValue({
    purchases: [],
  } as never);
  vi.spyOn(dataInfraApi, "listFaroDailyImports").mockResolvedValue({ imports: [] } as never);
  vi.spyOn(dataInfraApi, "listEquipmentLoans").mockResolvedValue({ loans: [] } as never);
  vi.spyOn(dataInfraApi, "listDriverVendorMerges").mockResolvedValue({ merges: [] } as never);
}

describe("FactoringHomePage KPI row (FACT-S01 / 443.267 board 4)", () => {
  it("renders the board KPI strip from a successful summary fetch", async () => {
    stubHappyPathApis();
    vi.spyOn(factoringApi, "getFactoringSummary").mockResolvedValue({
      active_factor_name: "Triumph Business Capital",
      active_factor_id: "vendor-triumph-1",
      active_factor_profile_id: "factor-profile-1",
      outstanding_liability_balance: 12500.5,
      mtd_advanced_total: 84000,
      mtd_advances_count: 3,
      chargeback_balance: 0,
      recourse_days: 95,
      uncleared_cents: 0,
      uncleared_documents: [],
      cleared_open_cents: 0,
    } as never);
    wrap(<FactoringHomePage />);
    expect(await screen.findByTestId("factoring-home-kpi-row")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId("factoring-kpi-outstanding-liability").textContent).toContain("$12,500.50");
    });
    expect(screen.getByTestId("factoring-kpi-outstanding-liability").textContent).toMatch(/Outstanding liability/i);
    expect(await screen.findByText("Triumph Business Capital")).toBeTruthy();
  });

  it("shows a named ListErrorBanner instead of silently keeping fabricated defaults when the summary fetch fails", async () => {
    stubHappyPathApis();
    vi.spyOn(factoringApi, "getFactoringSummary").mockRejectedValue(new Error("boom"));
    wrap(<FactoringHomePage />);
    expect(await screen.findByText(/Failed to load/i)).toBeTruthy();
    expect(await screen.findByTestId("factoring-home-kpi-row")).toBeTruthy();
    expect(screen.getByTestId("factoring-kpi-outstanding-liability").textContent).toContain("—");
  });
});
