import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as factoringApi from "../../../api/factoring";
import * as factoringPurchasesApi from "../../../api/factoring-purchases";
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
    // LEAD 443.172 — the report reads purchase lines (one row per purchased invoice); voided purchases never come back.
    vi.spyOn(factoringPurchasesApi, "listFactoringPurchaseLines").mockResolvedValue({
      lines: [
        {
          purchase_line_id: "pl-1", line_no: 1, purchase_id: "p-1", purchase_display_id: "FP-2026-00009", purchase_date: "2026-08-10",
          wire_date: null, faro_report_ref: null, invoice_id: "inv-1", invoice_display_id: "2-13510", invoice_total_cents: 300000,
          customer_id: "cust-1", customer_name: "Acme Logistics", load_id: "load-1", load_number: "13510", settlement_id: null,
          settlement_display_id: null, gross_cents: 300000, escrow_reserve_cents: 4500, cash_reserve_cents: 0, fee_cents: 4500,
          net_advance_cents: 291000, faro_invoice_number: "2",
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

    const report = await screen.findByTestId("factoring-purchase-report");
    // Scope to the purchase report's own table — the page renders other tables whose headers also say "Purchase".
    const headers = [...report.querySelectorAll("thead th")].map((el) => el.textContent?.trim() ?? "");
    const idx = (label: string) => headers.findIndex((h) => h.includes(label));

    expect(idx("Purchased")).toBeGreaterThanOrEqual(0);
    expect(headers.filter((h) => h === "Purchased").length).toBe(1);
    expect(idx("Net Adv")).toBeGreaterThan(idx("Purchased"));
    expect(idx("Escrow Rsv")).toBeGreaterThan(idx("Net Adv"));
    expect(idx("Cash Rsv")).toBeGreaterThan(idx("Escrow Rsv"));
    expect(idx("Fees")).toBeGreaterThan(idx("Cash Rsv"));
  });
});

describe("FactoringHomePage Purchase Report rows (LEAD 443.172)", () => {
  it("renders one row per purchased invoice with the real escrow split and the purchase number", async () => {
    vi.spyOn(mdataApi, "listVendors").mockResolvedValue({ vendors: [] } as never);
    vi.spyOn(factoringApi, "listFactors").mockResolvedValue({ factors: [] } as never);
    vi.spyOn(factoringApi, "getFactoringSummary").mockResolvedValue({ active_factor_name: "Faro Factoring", reserve_balance: 0, recourse_days: 95 } as never);
    vi.spyOn(factoringApi, "getFactoringRecoursePipeline").mockResolvedValue({ invoices: [] } as never);
    vi.spyOn(factoringPurchasesApi, "listFactoringPurchaseLines").mockResolvedValue({
      lines: [
        { purchase_line_id: "pl-1", line_no: 1, purchase_id: "p-1", purchase_display_id: "FP-2026-00009", purchase_date: "2026-08-10", wire_date: null, faro_report_ref: null, invoice_id: "inv-1", invoice_display_id: "2-13510", invoice_total_cents: 300000, customer_id: "cust-1", customer_name: "Impact Bulk Logistics", load_id: "load-1", load_number: "13510", settlement_id: null, settlement_display_id: null, gross_cents: 300000, escrow_reserve_cents: 4500, cash_reserve_cents: 0, fee_cents: 4500, net_advance_cents: 291000, faro_invoice_number: "2" },
        { purchase_line_id: "pl-2", line_no: 2, purchase_id: "p-1", purchase_display_id: "FP-2026-00009", purchase_date: "2026-08-10", wire_date: null, faro_report_ref: null, invoice_id: "inv-2", invoice_display_id: "3-13508", invoice_total_cents: 250000, customer_id: "cust-2", customer_name: "NCC Logistics", load_id: "load-2", load_number: "13508", settlement_id: null, settlement_display_id: null, gross_cents: 250000, escrow_reserve_cents: 3750, cash_reserve_cents: 0, fee_cents: 3750, net_advance_cents: 242500, faro_invoice_number: "3" },
      ],
    } as never);
    vi.spyOn(factoringApi, "getFactoringChargebacksFees").mockResolvedValue({ history: [], monthly_summary: [] } as never);
    vi.spyOn(factoringApi, "getFactoringStatementsSettings").mockResolvedValue({ current: { active_factor_count: 1, single_factor_invariant_ok: true, recourse_days: 95 }, statements: [] } as never);
    vi.spyOn(factoringApi, "scanDuplicateVendors").mockResolvedValue({ pairs: [] } as never);
    vi.spyOn(dataInfraApi, "listFaroDailyImports").mockResolvedValue({ imports: [] } as never);
    vi.spyOn(dataInfraApi, "listEquipmentLoans").mockResolvedValue({ loans: [] } as never);
    vi.spyOn(dataInfraApi, "listDriverVendorMerges").mockResolvedValue({ merges: [] } as never);

    wrap(<FactoringHomePage initialTab="purchase_report" />);
    const report = await screen.findByTestId("factoring-purchase-report");
    await screen.findAllByText("2-13510");
    const text = report.textContent ?? "";
    expect(text).toContain("3-13508");
    expect(text).toContain("$3,000.00");
    expect(text).toContain("$2,500.00");
    expect(text).toContain("$45.00");
    expect(text).not.toContain("Unknown Customer");
  });
});
