import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as factoringApi from "../../../api/factoring";
import * as dataInfraApi from "../../../api/data-infra";
import * as factoringKpisApi from "../../../api/factoring-kpis";
import * as mdataApi from "../../../api/mdata";
import { FactoringHomePage } from "../FactoringHome";
import { ToastProvider } from "../../../components/Toast";

/**
 * OWNER MEGA-REPORT 2026-09-09: "Reserve" (item 10 of the real 15-item nav) was a stub. ROUND 315 B7 mounted
 * the shared reserves panel; ROUND 326.2 item 4 binds its Escrow / Cash / Total to the factoring KPI engine
 * (Faro Escrow / Cash Reserve role balances — the same figures Banking shows), plus the real reserve-movement history table.
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
    <MemoryRouter initialEntries={["/factoring/reserve"]}>
      <QueryClientProvider client={qc}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

function stubCommonApis() {
  vi.spyOn(mdataApi, "listVendors").mockResolvedValue({ vendors: [] } as never);
  vi.spyOn(factoringApi, "listFactors").mockResolvedValue({ factors: [] } as never);
  vi.spyOn(factoringApi, "getFactoringRecoursePipeline").mockResolvedValue({ invoices: [] } as never);
  vi.spyOn(factoringApi, "getFactoringChargebacksFees").mockResolvedValue({ history: [], monthly_summary: [] } as never);
  vi.spyOn(factoringApi, "getFactoringStatementsSettings").mockResolvedValue({
    current: { active_factor_count: 1, single_factor_invariant_ok: true, recourse_days: 95 },
    statements: [],
  } as never);
  vi.spyOn(factoringApi, "scanDuplicateVendors").mockResolvedValue({ pairs: [] } as never);
  vi.spyOn(dataInfraApi, "listFaroDailyImports").mockResolvedValue({ imports: [] } as never);
  vi.spyOn(dataInfraApi, "listEquipmentLoans").mockResolvedValue({ loans: [] } as never);
  vi.spyOn(dataInfraApi, "listDriverVendorMerges").mockResolvedValue({ merges: [] } as never);
}

describe("FactoringHomePage Reserve tab (real, owner mega-report 2026-09-09)", () => {
  it("renders escrow / cash / total reserve from the factoring KPI engine and the real movement history", async () => {
    stubCommonApis();
    vi.spyOn(factoringApi, "getFactoringSummary").mockResolvedValue({
      active_factor_name: "Faro Factoring",
      active_factor_id: "factor-1",
      recourse_days: 95,
    } as never);
    vi.spyOn(factoringKpisApi, "getFactoringKpis").mockResolvedValue({
      range: { from: "2026-01-01", to: "2026-10-02" },
      kpis: [
        { key: "escrow_reserve_balance", label: "Escrow reserve balance", unit: "cents", value: 5100, source: "s", gl_account: "1236", row_count: 1, empty_reason: null },
        { key: "cash_reserve_balance", label: "Cash reserve balance", unit: "cents", value: 7800, source: "s", gl_account: "1235", row_count: 1, empty_reason: null },
        { key: "fees_accrued", label: "Factoring fees accrued", unit: "cents", value: 12900, source: "s", gl_account: "6400", row_count: 1, empty_reason: null },
        { key: "purchased_volume", label: "Purchased volume", unit: "cents", value: 860000, source: "s", gl_account: "2150", row_count: 1, empty_reason: null },
      ],
    } as never);
    vi.spyOn(factoringApi, "getReserveBalanceHistory").mockResolvedValue({
      movements: [
        {
          id: "mv-1",
          operating_company_id: companyId,
          batch_id: null,
          factor_id: "factor-1",
          direction: "credit",
          amount_cents: 5250,
          reason: "Reserve held on invoice 393702",
          created_at: "2026-09-06",
          signed_amount_cents: 5250,
          running_balance_cents: 227611,
        },
      ],
      total: 1,
      limit: 100,
      offset: 0,
    } as never);

    wrap(<FactoringHomePage initialTab="reserve" />);

    await screen.findByText("Reserve held on invoice 393702");
    // ROUND 435 — no KPI twice: escrow and cash show once, in the page-level factoring KPI strip; the reserve panel adds the total.
    expect((await screen.findByTestId("factoring-kpi-escrow_reserve_balance")).textContent).toContain("$51.00");
    expect(screen.getByTestId("factoring-kpi-cash_reserve_balance").textContent).toContain("$78.00");
    expect((await screen.findByTestId("factoring-reserves-shared-kpi-total")).textContent).toContain("$129.00");
    expect(screen.queryByTestId("factoring-reserves-shared-kpi-escrow")).toBeNull();
    expect(screen.queryByTestId("factoring-reserves-shared-kpi-cash")).toBeNull();
  });

  it("without an active factor, says the reserve ledger has nothing to scope to", async () => {
    stubCommonApis();
    vi.spyOn(factoringApi, "getFactoringSummary").mockResolvedValue({
      active_factor_name: null,
      active_factor_id: null,
      recourse_days: 95,
    } as never);
    vi.spyOn(factoringKpisApi, "getFactoringKpis").mockResolvedValue({ range: { from: "2026-01-01", to: "2026-10-02" }, kpis: [] } as never);
    wrap(<FactoringHomePage initialTab="reserve" />);

    await screen.findByTestId("factoring-reserve-report");
    expect(await screen.findByText(/No active factor — reserve ledger has nothing to scope to/i)).toBeTruthy();
  });

  it("shows Unavailable, never $0, when the engine fails", async () => {
    stubCommonApis();
    vi.spyOn(factoringApi, "getFactoringSummary").mockResolvedValue({ active_factor_name: null, active_factor_id: null, recourse_days: 95 } as never);
    vi.spyOn(factoringKpisApi, "getFactoringKpis").mockRejectedValue(new Error("boom"));
    wrap(<FactoringHomePage initialTab="reserve" />);
    await screen.findByTestId("factoring-reserve-report");
    await vi.waitFor(() => expect(screen.getByTestId("factoring-reserves-shared-kpi-total").textContent).toContain("Unavailable"));
  });
});
