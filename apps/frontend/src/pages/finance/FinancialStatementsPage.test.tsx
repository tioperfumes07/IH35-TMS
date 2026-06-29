import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinancialStatementsPage } from "./FinancialStatementsPage";
import * as reportsApi from "../../api/reports";
import * as flagHook from "../../hooks/useFeatureFlag";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91e0bf0a-133f-4ce8-a734-2586cfa66d96" }),
}));

vi.mock("./FinanceModuleTabs", () => ({ FinanceModuleTabs: () => null }));

vi.mock("../../api/reports", () => ({
  getProfitLossReport: vi.fn(),
  getBalanceSheetReport: vi.fn(),
  getTrialBalanceReport: vi.fn(),
}));

vi.mock("../../hooks/useFeatureFlag", () => ({ useFeatureFlag: vi.fn() }));

function wrap(ui: ReactElement) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {ui}
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("FinancialStatementsPage (FIN-19)", () => {
  afterEach(cleanup);

  it("shows the disabled state when FINANCE_STATEMENTS_UI_ENABLED is off (no data fetch)", async () => {
    vi.mocked(flagHook.useFeatureFlag).mockReturnValue({ enabled: false, loading: false, error: null });

    render(wrap(<FinancialStatementsPage />));

    expect(await screen.findByText(/not yet enabled/i)).toBeTruthy();
    expect(reportsApi.getProfitLossReport).not.toHaveBeenCalled();
    expect(reportsApi.getBalanceSheetReport).not.toHaveBeenCalled();
    expect(reportsApi.getTrialBalanceReport).not.toHaveBeenCalled();
  });

  it("renders profit & loss when the flag is enabled", async () => {
    vi.mocked(flagHook.useFeatureFlag).mockReturnValue({ enabled: true, loading: false, error: null });
    vi.mocked(reportsApi.getProfitLossReport).mockResolvedValue({
      revenue: { lines: [{ account_code: "4000", account_name: "Freight revenue", account_type: "Income", amount: 1000000 }], total: 1000000 },
      cogs: { lines: [], total: 0 },
      gross_profit: 1000000,
      operating_expenses: { lines: [{ account_code: "6000", account_name: "Fuel", account_type: "Expense", amount: 300000 }], total: 300000 },
      net_income: 700000,
    });

    render(wrap(<FinancialStatementsPage />));

    await waitFor(() => expect(reportsApi.getProfitLossReport).toHaveBeenCalled());
    expect(await screen.findByText("Freight revenue")).toBeTruthy();
    expect(await screen.findByText("Fuel")).toBeTruthy();
  });
});
