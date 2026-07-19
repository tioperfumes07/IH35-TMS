import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as reportsApi from "../../../api/reports";
import { ManagementReportPackagePage } from "../ManagementReportPackagePage";

const COMPANY_ID = "00000000-0000-4000-8000-000000000099";
let selectedCompanyId: string | null = COMPANY_ID;

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId,
    selectedCompany: selectedCompanyId
      ? { id: selectedCompanyId, legal_name: "IH35 Transportation LLC" }
      : null,
  }),
}));

vi.mock("../ReportsSubNav", () => ({
  ReportsSubNav: () => <nav aria-label="Reports subnav stub" />,
}));

function wrap(ui: ReactElement, initialEntry = "/reports/management?type=company-overview") {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/reports/management" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ManagementReportPackagePage", () => {
  beforeEach(() => {
    selectedCompanyId = COMPANY_ID;
    vi.spyOn(reportsApi, "getProfitLossReport").mockResolvedValue({
      revenue: { lines: [], total: 0 },
      cogs: { lines: [], total: 0 },
      operating_expenses: { lines: [], total: 0 },
      gross_profit: 0,
      net_income: 0,
    } as unknown as Awaited<ReturnType<typeof reportsApi.getProfitLossReport>>);
    vi.spyOn(reportsApi, "getBalanceSheetReport").mockResolvedValue({
      assets: { lines: [], total: 0 },
      liabilities: { lines: [], total: 0 },
      equity: { lines: [], total: 0 },
      total_liabilities_and_equity: 0,
    } as unknown as Awaited<ReturnType<typeof reportsApi.getBalanceSheetReport>>);
    vi.spyOn(reportsApi, "getArAgingReport").mockResolvedValue({
      status: "real",
      generated_at: "2026-07-18T00:00:00.000Z",
      as_of_date: "2026-07-18",
      total_open_cents: 0,
      total_open_invoices: 0,
      rows: [],
    });
    vi.spyOn(reportsApi, "getApAgingReport").mockResolvedValue({
      status: "real",
      generated_at: "2026-07-18T00:00:00.000Z",
      as_of_date: "2026-07-18",
      rows: [],
    });
    vi.spyOn(reportsApi, "getCustomerProfitability").mockResolvedValue({
      by_customer: [],
    } as unknown as Awaited<ReturnType<typeof reportsApi.getCustomerProfitability>>);
  });

  it("requires an operating company before fetching package sections", async () => {
    selectedCompanyId = null;
    render(wrap(<ManagementReportPackagePage />));
    expect(await screen.findByText(/Select an operating company/i)).toBeInTheDocument();
    expect(reportsApi.getProfitLossReport).not.toHaveBeenCalled();
    expect(reportsApi.getBalanceSheetReport).not.toHaveBeenCalled();
  });

  it("renders Company Overview cover, TOC, and entity-scoped sections", async () => {
    render(wrap(<ManagementReportPackagePage />, "/reports/management?type=company-overview"));
    expect((await screen.findAllByRole("heading", { name: "Company Overview" })).length).toBeGreaterThan(0);
    expect(screen.getByText("Management Report Package")).toBeInTheDocument();
    expect(screen.getByText("IH35 Transportation LLC")).toBeInTheDocument();
    expect(screen.getByText("Table of Contents")).toBeInTheDocument();
    const toc = screen.getByText("Table of Contents").parentElement!;
    expect(within(toc).getByText("Profit & Loss")).toBeInTheDocument();
    expect(within(toc).getByText("Balance Sheet")).toBeInTheDocument();
    await waitFor(() => {
      expect(reportsApi.getProfitLossReport).toHaveBeenCalledWith(
        expect.objectContaining({ operating_company_id: COMPANY_ID })
      );
      expect(reportsApi.getBalanceSheetReport).toHaveBeenCalledWith(
        expect.objectContaining({ operating_company_id: COMPANY_ID })
      );
    });
  });

  it("Sales Performance package loads A/R aging for the selected entity", async () => {
    render(wrap(<ManagementReportPackagePage />, "/reports/management?type=sales-performance"));
    expect((await screen.findAllByRole("heading", { name: "Sales Performance" })).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(reportsApi.getArAgingReport).toHaveBeenCalledWith(COMPANY_ID, expect.any(String));
      expect(reportsApi.getCustomerProfitability).toHaveBeenCalledWith(
        expect.objectContaining({ operating_company_id: COMPANY_ID })
      );
    });
  });

  it("Expenses Performance package loads A/P aging for the selected entity", async () => {
    render(wrap(<ManagementReportPackagePage />, "/reports/management?type=expenses-performance"));
    expect((await screen.findAllByRole("heading", { name: "Expenses Performance" })).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(reportsApi.getApAgingReport).toHaveBeenCalledWith(COMPANY_ID, expect.any(String));
    });
  });

  it("package switcher links use the existing ?type= contract and are keyboard focusable", async () => {
    const user = userEvent.setup();
    render(wrap(<ManagementReportPackagePage />, "/reports/management?type=company-overview"));
    const salesLink = await screen.findByRole("link", { name: "Sales Performance" });
    expect(salesLink).toHaveAttribute("href", "/reports/management?type=sales-performance");
    salesLink.focus();
    expect(salesLink).toHaveFocus();
    await user.keyboard("{Enter}");
    expect((await screen.findAllByRole("heading", { name: "Sales Performance" })).length).toBeGreaterThan(0);
  });

  it("Apply is keyboard-activatable and Print / Save PDF remains available", async () => {
    const user = userEvent.setup();
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(wrap(<ManagementReportPackagePage />));
    const apply = await screen.findByRole("button", { name: "Apply" });
    apply.focus();
    await user.keyboard("{Enter}");
    const printBtn = screen.getByRole("button", { name: /Print \/ Save PDF/i });
    expect(printBtn).toBeEnabled();
    await user.click(printBtn);
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });
});
