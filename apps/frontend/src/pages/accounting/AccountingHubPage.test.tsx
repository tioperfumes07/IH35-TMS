import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AccountingHubPage } from "./AccountingHubPage";
import * as accountingApi from "../../api/accounting";
import * as reportsApi from "../../api/reports";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../api/accounting", () => ({
  listBills: vi.fn().mockResolvedValue({ rows: [] }),
  listBillPayments: vi.fn().mockResolvedValue({ rows: [] }),
  listInvoices: vi.fn().mockResolvedValue({ invoices: [] }),
  listPayments: vi.fn().mockResolvedValue({ rows: [] }),
}));

vi.mock("../../api/banking", () => ({
  getQboSyncQueue: vi.fn().mockResolvedValue({ items: [] }),
  getQboSyncQueueStats: vi.fn().mockResolvedValue({ pending: 0, failed: 0 }),
}));

vi.mock("../../api/driverFinance", () => ({
  listSettlements: vi.fn().mockResolvedValue({ settlements: [] }),
}));

vi.mock("../../api/reports", () => ({
  getTrialBalanceReport: vi.fn(),
  getProfitLossReport: vi.fn(),
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

describe("AccountingHubPage", () => {
  it("shows trial balance hub snapshot when ledger report loads", async () => {
    vi.mocked(reportsApi.getTrialBalanceReport).mockResolvedValue({
      rows: [{ account_id: "a1", account_code: "1000", account_name: "Cash", account_type: "Asset", total_debits: 100, total_credits: 0, net_balance: 100 }],
      summary: { grand_total_debits: 100, grand_total_credits: 100, balanced: true },
    });
    vi.mocked(reportsApi.getProfitLossReport).mockRejectedValue(new Error("not ready"));

    render(wrap(<AccountingHubPage />));

    await waitFor(() => expect(reportsApi.getTrialBalanceReport).toHaveBeenCalled());
    expect(await screen.findByText("Trial balance (Block 10 foundation)")).toBeInTheDocument();
    expect(screen.getByText("Balanced")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open trial balance/i })).toHaveAttribute("href", "/reports/trial-balance");
  });

  it("falls back to contract stub when trial balance endpoint is unavailable", async () => {
    vi.mocked(reportsApi.getTrialBalanceReport).mockRejectedValue(new Error("503"));
    vi.mocked(reportsApi.getProfitLossReport).mockRejectedValue(new Error("503"));

    render(wrap(<AccountingHubPage />));

    await waitFor(() => expect(reportsApi.getTrialBalanceReport).toHaveBeenCalled());
    await waitFor(() => expect(reportsApi.getProfitLossReport).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText("Contract stub").length).toBeGreaterThanOrEqual(2));
    expect(accountingApi.listBills).toHaveBeenCalled();
  });

  it("shows profit and loss hub snapshot when ledger report loads", async () => {
    vi.mocked(reportsApi.getTrialBalanceReport).mockRejectedValue(new Error("503"));
    vi.mocked(reportsApi.getProfitLossReport).mockResolvedValue({
      revenue: { lines: [], total: 500_000 },
      cogs: { lines: [], total: 100_000 },
      gross_profit: 400_000,
      operating_expenses: { lines: [], total: 150_000 },
      net_income: 250_000,
    });

    render(wrap(<AccountingHubPage />));

    await waitFor(() => expect(reportsApi.getProfitLossReport).toHaveBeenCalled());
    expect(await screen.findByText("Profit & loss (Block 12 foundation)")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("$2,500.00")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Open profit & loss/i })).toHaveAttribute("href", "/reports/profit-loss");
  });
});
