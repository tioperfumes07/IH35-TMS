import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
vi.mock("./RecordTransferModal", () => ({
  RecordTransferModal: (props: { open: boolean; defaultTransferType?: string }) =>
    props.open ? <div data-testid="record-transfer-modal-stub" data-default-type={props.defaultTransferType} /> : null,
}));
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

  // BANK-F01 / AUDIT row 2 — Cash posting KPI renders API dollars and matches tile-scale balances.
  // After #4011 the KPI payload is already dollars (authoritativeTotalCash / 100); do not expect cents.
  it("renders the cash KPI in dollars from the API dollar payload", async () => {
    vi.mocked(bankingApi.getBankingKpis).mockResolvedValue({
      // TRANSP prod authoritative total (2026-08-02): −17,393,202 cents → −173,932.02 dollars.
      total_cash: -173932.02,
      dip_operating: 0,
      dip_payroll: 0,
      total_uncategorized: 0,
      factoring_reserve: 0,
      driver_escrow: 0,
    });
    vi.mocked(bankingApi.getBankingTiles).mockResolvedValue({ tiles: [] });
    vi.mocked(bankingApi.getBankingUncategorized).mockResolvedValue({ transactions: [], meta: { uncategorized_count: 0 } });
    vi.mocked(bankingApi.getPlaidBankAccounts).mockResolvedValue({ accounts: [] });
    vi.mocked(bankingApi.getReconciliationSessions).mockResolvedValue({ open_sessions: [], completed_sessions: [] });
    vi.mocked(bankingApi.getAllAccounts).mockResolvedValue({ accounts: [] });

    render(wrap(<BankingHomePage />));

    expect(await screen.findByTitle("-$173,932.02")).toBeInTheDocument();
    // Stale #3997 double-convert would show −$1,739.32; cents-as-dollars would show −$17,393,202.00.
    expect(screen.queryByTitle("-$1,739.32")).not.toBeInTheDocument();
    expect(screen.queryByTitle("-$17,393,202.00")).not.toBeInTheDocument();
  });

  it("shows real bank accounts from plaid feed when tile list is empty", async () => {
    vi.mocked(bankingApi.getBankingKpis).mockResolvedValue({
      total_cash: 1000,
      dip_operating: 0,
      dip_payroll: 0,
      total_uncategorized: 0,
      factoring_reserve: 0,
      driver_escrow: 0,
    });
    vi.mocked(bankingApi.getBankingTiles).mockResolvedValue({ tiles: [] });
    vi.mocked(bankingApi.getBankingUncategorized).mockResolvedValue({ transactions: [], meta: { uncategorized_count: 0 } });
    vi.mocked(bankingApi.getReconciliationSessions).mockResolvedValue({ open_sessions: [], completed_sessions: [] });
    vi.mocked(bankingApi.getAllAccounts).mockResolvedValue({ accounts: [] });
    vi.mocked(bankingApi.getPlaidBankAccounts).mockResolvedValue({
      accounts: [
        {
          id: "acct-5007",
          operating_company_id: "company-1",
          institution_name: "Amex",
          account_name: "Business Platinum Card",
          account_mask: "5007",
          account_type: "credit",
          current_balance_cents: 123400,
          available_balance_cents: 123400,
          currency_code: "USD",
          sync_status: "active",
          is_active: true,
          last_synced_at: null,
        },
        {
          id: "acct-3500",
          operating_company_id: "company-1",
          institution_name: "Bank",
          account_name: "Business Checking",
          account_mask: "3500",
          account_type: "depository",
          current_balance_cents: 500000,
          available_balance_cents: 500000,
          currency_code: "USD",
          sync_status: "active",
          is_active: true,
          last_synced_at: null,
        },
      ],
    });

    render(wrap(<BankingHomePage />));

    expect(await screen.findByText("Business Platinum Card ••••5007")).toBeInTheDocument();
    expect(screen.getByText("Business Checking ••••3500")).toBeInTheDocument();
    expect(screen.queryByText("No accounts yet.")).not.toBeInTheDocument();
  });

  it('labels escrow visualizer count as "Drivers with escrow:"', async () => {
    vi.mocked(bankingApi.getBankingKpis).mockResolvedValue({
      total_cash: 1000,
      dip_operating: 200,
      dip_payroll: 300,
      total_uncategorized: 0,
      factoring_reserve: 50,
      driver_escrow: 20,
      drivers_with_escrow_balance: 5,
      active_drivers: 50,
    });
    vi.mocked(bankingApi.getBankingTiles).mockResolvedValue({ tiles: [] });
    vi.mocked(bankingApi.getBankingUncategorized).mockResolvedValue({ transactions: [], meta: { uncategorized_count: 0 } });
    vi.mocked(bankingApi.getReconciliationSessions).mockResolvedValue({ open_sessions: [], completed_sessions: [] });
    vi.mocked(bankingApi.getAllAccounts).mockResolvedValue({ accounts: [] });
    vi.mocked(bankingApi.getPlaidBankAccounts).mockResolvedValue({ accounts: [] });

    render(wrap(<BankingHomePage />));

    expect(await screen.findByText("Drivers with escrow:")).toBeInTheDocument();
    expect(await screen.findByText("5")).toBeInTheDocument();
    expect(screen.queryByText("Active drivers")).not.toBeInTheDocument();
  });
});

describe("DISP-F6XXX — Record Deposit reaches Cash Deposit (undeposited funds -> bank)", () => {
  it('"+ Record Deposit" opens RecordTransferModal defaulted to cash_deposit', async () => {
    vi.mocked(bankingApi.getBankingKpis).mockResolvedValue({
      total_cash: 0,
      dip_operating: 0,
      dip_payroll: 0,
      total_uncategorized: 0,
      factoring_reserve: 0,
      driver_escrow: 0,
      drivers_with_escrow_balance: 0,
      active_drivers: 0,
    });
    vi.mocked(bankingApi.getBankingTiles).mockResolvedValue({ tiles: [] });
    vi.mocked(bankingApi.getBankingUncategorized).mockResolvedValue({ transactions: [], meta: { uncategorized_count: 0 } });
    vi.mocked(bankingApi.getReconciliationSessions).mockResolvedValue({ open_sessions: [], completed_sessions: [] });
    vi.mocked(bankingApi.getAllAccounts).mockResolvedValue({ accounts: [] });
    vi.mocked(bankingApi.getPlaidBankAccounts).mockResolvedValue({ accounts: [] });

    render(wrap(<BankingHomePage />));

    expect(screen.queryByTestId("record-transfer-modal-stub")).not.toBeInTheDocument();
    await userEvent.click(await screen.findByTestId("banking-home-record-deposit"));
    const stub = await screen.findByTestId("record-transfer-modal-stub");
    expect(stub).toHaveAttribute("data-default-type", "cash_deposit");
  });
});
