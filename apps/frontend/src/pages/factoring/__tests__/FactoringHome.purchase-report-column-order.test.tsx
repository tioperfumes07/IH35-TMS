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
 * OWNER MEGA-REPORT 2026-09-09 (verbatim): "amount of the ORIGINAL invoice, then advance, then
 * reserve, then fees — in that order, every tab." Guards Purchase Report's real dollar columns
 * (Purchase/Net Adv/Cash Rsv/Fees) against drifting out of that sequence again.
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
    <MemoryRouter initialEntries={["/factoring/purchase-report"]}>
      <QueryClientProvider client={qc}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("FactoringHomePage Purchase Report column order", () => {
  it("groups Purchase, Net Adv, Cash Rsv, Fees in that exact sequence", async () => {
    vi.spyOn(mdataApi, "listVendors").mockResolvedValue({ vendors: [] } as never);
    vi.spyOn(factoringApi, "listFactors").mockResolvedValue({ factors: [] } as never);
    vi.spyOn(factoringApi, "getFactoringSummary").mockResolvedValue({
      active_factor_name: "Faro Factoring",
      reserve_balance: 100,
      recourse_days: 95,
    } as never);
    vi.spyOn(factoringApi, "getFactoringRecoursePipeline").mockResolvedValue({
      invoices: [
        {
          factoring_advance_id: "adv-1",
          customer_id: "cust-1",
          customer_name: "Acme Logistics",
          invoice_id: "inv-1",
          invoice_reference: "INV-001",
          factored_at: "2026-09-06",
          invoice_amount: 3500,
          advance_amount: 3395,
          reserve_amount: 52.5,
        },
      ],
    } as never);
    vi.spyOn(factoringApi, "getFactoringChargebacksFees").mockResolvedValue({ history: [], monthly_summary: [] } as never);
    vi.spyOn(factoringApi, "getFactoringStatementsSettings").mockResolvedValue({
      current: { active_factor_count: 1, single_factor_invariant_ok: true, recourse_days: 95 },
      statements: [],
    } as never);
    vi.spyOn(factoringApi, "scanDuplicateVendors").mockResolvedValue({ pairs: [] } as never);
    vi.spyOn(dataInfraApi, "listFaroDailyImports").mockResolvedValue({ imports: [] } as never);
    vi.spyOn(dataInfraApi, "listEquipmentLoans").mockResolvedValue({ loans: [] } as never);
    vi.spyOn(dataInfraApi, "listDriverVendorMerges").mockResolvedValue({ merges: [] } as never);

    wrap(<FactoringHomePage initialTab="purchase_report" />);

    await screen.findByTestId("factoring-purchase-report");
    const headers = [...document.querySelectorAll("thead th")].map((el) => el.textContent?.trim() ?? "");
    const idx = (label: string) => headers.findIndex((h) => h.includes(label));

    expect(idx("Purchase")).toBeGreaterThanOrEqual(0);
    expect(idx("Net Adv")).toBeGreaterThan(idx("Purchase"));
    expect(idx("Cash Rsv")).toBeGreaterThan(idx("Net Adv"));
    expect(idx("Fees")).toBeGreaterThan(idx("Cash Rsv"));
  });
});
