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
 * OWNER MEGA-REPORT 2026-09-09: "Reserve" (item 10 of the real 15-item nav, per
 * 09-08-2026-Cursor-FAC09a-CORRECTED-FROM-REAL-SCREENSHOTS.md) was a stub. Now real: Total
 * Reserve bound to the same summary.reserve_balance every other tab uses, plus a real
 * reserve-movement history table (getReserveBalanceHistory). Escrow/Cash split stays an honest
 * "—" -- this schema has no type split on reserve_balance.
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
  it("renders real Total Reserve and a real reserve movement history table, honest Escrow/Cash split", async () => {
    stubCommonApis();
    vi.spyOn(factoringApi, "getFactoringSummary").mockResolvedValue({
      active_factor_name: "Faro Factoring",
      active_factor_id: "factor-1",
      reserve_balance: 2276.11,
      recourse_days: 95,
    } as never);
    vi.spyOn(factoringApi, "getReserveBalanceHistory").mockResolvedValue({
      movements: [
        {
          id: "mv-1",
          tenant_id: companyId,
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
    expect(screen.getAllByText("$2,276.11").length).toBeGreaterThanOrEqual(1);
    // Honest, not fabricated: no Escrow/Cash split exists in this schema.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("without an active factor, shows an honest 'no factor' message instead of an empty crash", async () => {
    stubCommonApis();
    vi.spyOn(factoringApi, "getFactoringSummary").mockResolvedValue({
      active_factor_name: null,
      active_factor_id: null,
      reserve_balance: 0,
      recourse_days: 95,
    } as never);
    wrap(<FactoringHomePage initialTab="reserve" />);

    await screen.findByTestId("factoring-reserve-report");
    expect(screen.getByText(/No active factor configured/i)).toBeTruthy();
  });
});
