import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
vi.mock("./TransferModal", () => ({
  TransferModal: (props: { open: boolean }) => (props.open ? <div data-testid="transfer-modal-stub" /> : null),
}));
vi.mock("./RecordTransferModal", () => ({
  RecordTransferModal: (props: { open: boolean; defaultTransferType?: string }) =>
    props.open ? <div data-testid="record-transfer-modal-stub" data-default-type={props.defaultTransferType} /> : null,
}));
vi.mock("./RecordCCPaymentModal", () => ({ RecordCCPaymentModal: () => null }));
vi.mock("./components/DriverEscrowTabContent", () => ({ DriverEscrowTabContent: () => null }));
vi.mock("./components/ReconciliationTabContent", () => ({
  ReconciliationTabContent: () => <div data-testid="recon-shell-stub" />,
}));
vi.mock("./components/BankingReportsTabContent", () => ({ BankingReportsTabContent: () => null }));
vi.mock("./components/BankingPlaidConnectionsPanel", () => ({
  BankingPlaidConnectionsPanel: () => <div data-testid="plaid-connections" />,
}));
vi.mock("../../components/factoring/FactoringReservesSharedPanel", () => ({
  FactoringReservesSharedPanel: () => <div data-testid="factoring-reserves-shared-stub" />,
}));
vi.mock("../../api/factoring-kpis", () => ({
  getFactoringKpis: vi.fn().mockResolvedValue({ kpis: [] }),
}));
vi.mock("../../api/banking-kpis", () => ({
  getBankingLedgerKpis: vi.fn().mockResolvedValue({ kpis: [] }),
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
    getEscrowDriverBalances: vi.fn().mockResolvedValue({ drivers: [] }),
    getFactoringVirtual: vi.fn().mockResolvedValue({ companies: [] }),
    getMoneyMap: vi.fn().mockResolvedValue({
      accounts: [] as bankingApi.MoneyMapAccount[],
      totals: { in_cents: 0, out_cents: 0, line_count: 0, pending_review_count: 0 },
    }),
    getDriftAlerts: vi.fn().mockResolvedValue({ rows: [], total_count: 0 }),
    getPlaidCompanyTransactions: vi.fn().mockResolvedValue({ transactions: [] }),
    getQboSyncQueueStats: vi.fn().mockResolvedValue({
      pending: 0,
      in_flight: 0,
      synced: 0,
      failed: 0,
      blocked: 0,
      average_sync_ms: 0,
      last_successful_sync_at: null,
    }),
  };
});

vi.mock("../../api/forensic", () => ({
  getQboConnectionStatus: vi.fn().mockResolvedValue({ connected: false }),
}));

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

function stubHomeQueries() {
  vi.mocked(bankingApi.getBankingKpis).mockResolvedValue({
    total_cash: 1000,
    dip_operating: 200,
    dip_payroll: 300,
    total_uncategorized: 2,
    factoring_reserve: 50,
    driver_escrow: 20,
  });
  vi.mocked(bankingApi.getBankingTiles).mockResolvedValue({ tiles: [] });
  vi.mocked(bankingApi.getBankingUncategorized).mockResolvedValue({
    transactions: [],
    meta: { uncategorized_count: 2 },
  });
  vi.mocked(bankingApi.getPlaidBankAccounts).mockResolvedValue({ accounts: [] });
  vi.mocked(bankingApi.getReconciliationSessions).mockResolvedValue({ open_sessions: [], completed_sessions: [] });
  vi.mocked(bankingApi.getAllAccounts).mockResolvedValue({ accounts: [] });
}

describe("BankingHomePage — 443.267 board Home", () => {
  it("mounts board-faithful Home: KPIs + Accounts + Drift + Latest lines (not C-64 Uncategorized strip)", async () => {
    stubHomeQueries();
    vi.mocked(bankingApi.getMoneyMap).mockResolvedValue({
      accounts: [
        {
          bank_account_id: "acct-1",
          account_name: "Operating",
          account_nickname: "Operating",
          institution_name: "Bank",
          tile_kind: "real",
          last_feed_at: "2026-10-22T12:00:00.000Z",
          in_cents: 125000,
          out_cents: 45000,
          line_count: 12,
          pending_review_count: 2,
          outflow_groups: null,
          uncategorized_out_cents: 0,
          uncategorized_out_count: 0,
        },
      ],
      totals: { in_cents: 125000, out_cents: 45000, line_count: 12, pending_review_count: 2 },
    });

    render(wrap(<BankingHomePage />));

    expect(await screen.findByTestId("banking-home-board")).toBeInTheDocument();
    expect(screen.getByTestId("banking-home-board-kpis")).toBeInTheDocument();
    expect(screen.getByTestId("banking-kpi-money-in")).toBeInTheDocument();
    expect(screen.getByTestId("banking-kpi-lines-to-review")).toBeInTheDocument();
    expect(screen.getByText(/Reconciliation drift/i)).toBeInTheDocument();
    expect(screen.getByText(/Latest lines/i)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is matched automatically/i)).toBeInTheDocument();
    expect(screen.queryByTestId("banking-kpi-uncategorized")).not.toBeInTheDocument();
    expect(screen.queryByText(/Categorize · 2 unmatched bank transactions/i)).not.toBeInTheDocument();
  });

  it("renders Money in from money-map cents (dollars on the tile)", async () => {
    stubHomeQueries();
    vi.mocked(bankingApi.getMoneyMap).mockResolvedValue({
      accounts: [
        {
          bank_account_id: "acct-1",
          account_name: "Operating",
          account_nickname: "Operating",
          institution_name: "Bank",
          tile_kind: "real",
          last_feed_at: null,
          in_cents: 17393202,
          out_cents: 0,
          line_count: 1,
          pending_review_count: 0,
          outflow_groups: null,
          uncategorized_out_cents: 0,
          uncategorized_out_count: 0,
        },
      ],
      totals: { in_cents: 17393202, out_cents: 0, line_count: 1, pending_review_count: 0 },
    });

    render(wrap(<BankingHomePage />));

    const tile = await screen.findByTestId("banking-kpi-money-in");
    await waitFor(() => {
      expect(tile).toHaveTextContent(/\$173,932\.02/);
    });
    expect(tile).not.toHaveTextContent(/\$1,739\.32/);
  });

  it("lists money-map accounts on Home Accounts section", async () => {
    stubHomeQueries();
    vi.mocked(bankingApi.getBankingTiles).mockResolvedValue({
      tiles: [
        {
          id: "acct-3500",
          operating_company_id: "company-1",
          display_name: "Business Checking",
          account_type: "depository",
          tag: "",
          tile_kind: "real",
          current_balance: 5000,
          uncategorized_count: 0,
          color_tag: "",
          is_relay: false,
          display_order: 1,
          last_txn_date: "2026-10-22",
        },
      ],
    });
    vi.mocked(bankingApi.getMoneyMap).mockResolvedValue({
      accounts: [
        {
          bank_account_id: "acct-3500",
          account_name: "Business Checking",
          account_nickname: "Business Checking",
          institution_name: "Bank",
          tile_kind: "real",
          last_feed_at: "2026-10-22T12:00:00.000Z",
          in_cents: 500000,
          out_cents: 10000,
          line_count: 8,
          pending_review_count: 1,
          outflow_groups: null,
          uncategorized_out_cents: 0,
          uncategorized_out_count: 0,
        },
      ],
      totals: { in_cents: 500000, out_cents: 10000, line_count: 8, pending_review_count: 1 },
    });

    render(wrap(<BankingHomePage />));

    expect(await screen.findByText("Business Checking")).toBeInTheDocument();
    expect(screen.queryByText("No accounts yet.")).not.toBeInTheDocument();
  });
});

describe("DISP-F6XXX — Record Deposit reaches Cash Deposit (undeposited funds -> bank)", () => {
  it('"+ Record Deposit" opens RecordTransferModal defaulted to cash_deposit', async () => {
    stubHomeQueries();

    render(wrap(<BankingHomePage />));

    expect(screen.queryByTestId("record-transfer-modal-stub")).not.toBeInTheDocument();
    await userEvent.click(await screen.findByTestId("banking-new-menu-trigger"));
    await userEvent.click(await screen.findByTestId("banking-new-menu-item-record-deposit"));
    const stub = await screen.findByTestId("record-transfer-modal-stub");
    expect(stub).toHaveAttribute("data-default-type", "cash_deposit");
  });
});

describe("BANK-F02 — Record Transfer trigger reachable from the + New menu", () => {
  it("opens TransferModal via the dedicated banking-home-record-transfer trigger in the + New menu", async () => {
    stubHomeQueries();

    render(wrap(<BankingHomePage />));

    expect(screen.queryByTestId("transfer-modal-stub")).not.toBeInTheDocument();
    await userEvent.click(await screen.findByTestId("banking-new-menu-trigger"));
    await userEvent.click(await screen.findByTestId("banking-home-record-transfer"));
    expect(await screen.findByTestId("transfer-modal-stub")).toBeInTheDocument();
  });
});
