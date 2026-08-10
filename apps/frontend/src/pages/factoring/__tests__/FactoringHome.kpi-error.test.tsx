import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as factoringApi from "../../../api/factoring";
import * as dataInfraApi from "../../../api/data-infra";
import * as mdataApi from "../../../api/mdata";
import { FactoringHomePage } from "../FactoringHome";
import { ToastProvider } from "../../../components/Toast";

/**
 * FACT-S01: the KPI row (Active Factor / Reserve Balance / Chargeback Balance / Recourse Days)
 * had no isError branch — a failed /api/v1/factoring/summary fetch left `summary` undefined and
 * every tile rendered its "?? " fallback (Not configured / $0.00 / 95) exactly as if that were a
 * real reading. A named ListErrorBanner now surfaces the fetch failure above the KPI tiles.
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
  vi.spyOn(factoringApi, "listFactors").mockResolvedValue({ factors: [] } as never);
  vi.spyOn(factoringApi, "getFactoringRecoursePipeline").mockResolvedValue({ invoices: [] } as never);
  vi.spyOn(factoringApi, "getFactoringChargebacksFees").mockResolvedValue({ history: [], monthly_summary: [] } as never);
  vi.spyOn(factoringApi, "getFactoringStatementsSettings").mockResolvedValue({
    current: { active_factor_count: 0, single_factor_invariant_ok: true, recourse_days: 95 },
    statements: [],
  } as never);
  vi.spyOn(factoringApi, "scanDuplicateVendors").mockResolvedValue({ pairs: [] } as never);
  vi.spyOn(dataInfraApi, "listFaroDailyImports").mockResolvedValue({ imports: [] } as never);
  vi.spyOn(dataInfraApi, "listEquipmentLoans").mockResolvedValue({ loans: [] } as never);
  vi.spyOn(dataInfraApi, "listDriverVendorMerges").mockResolvedValue({ merges: [] } as never);
}

describe("FactoringHomePage KPI row (FACT-S01)", () => {
  it("renders the KPI row from a successful summary fetch", async () => {
    stubHappyPathApis();
    vi.spyOn(factoringApi, "getFactoringSummary").mockResolvedValue({
      active_factor_name: "Triumph Business Capital",
      reserve_balance: 1000,
      chargeback_balance: 0,
      recourse_days: 95,
    } as never);
    wrap(<FactoringHomePage />);
    expect(await screen.findByText("Triumph Business Capital")).toBeTruthy();
    expect(screen.getByTestId("factoring-home-kpi-row")).toBeTruthy();
  });

  it("shows a named ListErrorBanner instead of silently keeping fabricated defaults when the summary fetch fails", async () => {
    stubHappyPathApis();
    vi.spyOn(factoringApi, "getFactoringSummary").mockRejectedValue(new Error("boom"));
    wrap(<FactoringHomePage />);
    expect(await screen.findByText(/Failed to load\. Try refreshing\./i)).toBeTruthy();
  });
});
