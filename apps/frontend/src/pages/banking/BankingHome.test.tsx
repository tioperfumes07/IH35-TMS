import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as bankingApi from "../../api/banking";
import { ToastProvider } from "../../components/Toast";
import { BankingHomePage } from "./BankingHome";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "company-1" }),
}));

vi.mock("./components/ManageAccountsModal", () => ({
  ManageAccountsModal: () => null,
}));
vi.mock("../accounting/ManualJEModal", () => ({ ManualJEModal: () => null }));
vi.mock("./TransferModal", () => ({ TransferModal: () => null }));
vi.mock("./RecordCCPaymentModal", () => ({ RecordCCPaymentModal: () => null }));
vi.mock("./components/DriverEscrowTabContent", () => ({ DriverEscrowTabContent: () => null }));
vi.mock("./components/BankingReportsTabContent", () => ({ BankingReportsTabContent: () => null }));
vi.mock("./components/BankingPlaidConnectionsPanel", () => ({
  BankingPlaidConnectionsPanel: () => <div data-testid="plaid-connections" />,
}));

vi.mock("../../api/banking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/banking")>();
  return {
    ...actual,
    getBankingKpis: vi.fn(),
    getBankingTiles: vi.fn(),
    getBankingUncategorized: vi.fn(),
    getPlaidBankAccounts: vi.fn(),
    getReconciliationSessions: vi.fn(),
    getAllAccounts: vi.fn(),
    startReconciliationSession: vi.fn(),
  };
});

function wrap(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("BankingHomePage accounts summary", () => {
  it("removes categorize band and keeps uncategorized KPI navigation", async () => {
    vi.mocked(bankingApi.getBankingKpis).mockResolvedValue({
      total_cash: 1000,
      dip_operating: 200,
      dip_payroll: 300,
      total_uncategorized: 2,
      factoring_reserve: 50,
      driver_escrow: 20,
    });
    vi.mocked(bankingApi.getBankingTiles).mockResolvedValue({
      tiles: [
        {
          id: "tile-1",
          operating_company_id: "company-1",
          display_name: "Operating Account",
          account_type: "bank",
          tag: "",
          tile_kind: "real",
          current_balance: 1000,
          uncategorized_count: 2,
          color_tag: "",
          is_relay: false,
          display_order: 1,
          last_txn_date: "2026-05-18",
        },
      ],
    });
    vi.mocked(bankingApi.getBankingUncategorized).mockResolvedValue({
      transactions: [
        {
          id: "tx-1",
          transaction_date: "2026-05-17T00:00:00.000Z",
          description: "ONLINE PAYMENT - THANK YOU",
          amount_cents: -4550,
        },
      ],
      meta: { uncategorized_count: 2 },
    });
    vi.mocked(bankingApi.getPlaidBankAccounts).mockResolvedValue({ accounts: [] });
    vi.mocked(bankingApi.getReconciliationSessions).mockResolvedValue({ open_sessions: [], completed_sessions: [] });
    vi.mocked(bankingApi.getAllAccounts).mockResolvedValue({ accounts: [] });

    render(wrap(<BankingHomePage />));

    expect(await screen.findByText("Uncategorized")).toBeInTheDocument();
    expect(screen.queryByText(/Categorize · 2 unmatched bank transactions/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Uncategorized/i })).toBeInTheDocument();
    expect(screen.queryByText("2026-05-17T00:00:00.000Z")).not.toBeInTheDocument();
    expect(screen.queryByText("ONLINE PAYMENT - THANK YOU")).not.toBeInTheDocument();
  });

  it("shows bank accounts from Plaid data when tiles are empty", async () => {
    vi.mocked(bankingApi.getBankingKpis).mockResolvedValue({
      total_cash: 0,
      dip_operating: 0,
      dip_payroll: 0,
      total_uncategorized: 0,
      factoring_reserve: 0,
      driver_escrow: 0,
    });
    vi.mocked(bankingApi.getBankingTiles).mockResolvedValue({ tiles: [] });
    vi.mocked(bankingApi.getBankingUncategorized).mockResolvedValue({ transactions: [], meta: { uncategorized_count: 0 } });
    vi.mocked(bankingApi.getPlaidBankAccounts).mockResolvedValue({
      accounts: [
        {
          id: "acct-1",
          operating_company_id: "company-1",
          institution_name: "Chase",
          account_name: "Business Checking 3500",
          account_type: "depository",
          account_mask: "3500",
          current_balance_cents: 123456,
          available_balance_cents: 123456,
          currency_code: "USD",
          sync_status: "active",
          is_active: true,
          last_synced_at: null,
        },
        {
          id: "acct-2",
          operating_company_id: "company-1",
          institution_name: "Amex",
          account_name: "Business Platinum Card 5007",
          account_type: "credit",
          account_mask: "5007",
          current_balance_cents: 98765,
          available_balance_cents: 98765,
          currency_code: "USD",
          sync_status: "active",
          is_active: true,
          last_synced_at: null,
        },
      ],
    });
    vi.mocked(bankingApi.getReconciliationSessions).mockResolvedValue({ open_sessions: [], completed_sessions: [] });
    vi.mocked(bankingApi.getAllAccounts).mockResolvedValue({ accounts: [] });

    render(wrap(<BankingHomePage />));

    expect(await screen.findByText(/Business Checking 3500/i)).toBeInTheDocument();
    expect(screen.getByText(/Business Platinum Card 5007/i)).toBeInTheDocument();
    expect(screen.queryByText("No accounts yet.")).not.toBeInTheDocument();
  });
});
