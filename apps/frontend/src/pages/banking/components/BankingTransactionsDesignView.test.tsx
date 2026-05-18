import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as bankingApi from "../../../api/banking";
import { ToastProvider } from "../../../components/Toast";
import { BankingTransactionsDesignView, spentReceived } from "./BankingTransactionsDesignView";

vi.mock("../../../api/banking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/banking")>();
  return {
    ...actual,
    getPlaidCompanyTransactions: vi.fn(),
    getBankingSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
    getCoaAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
    categorizeTransaction: vi.fn().mockResolvedValue({ ok: true }),
    skipBankTransactionInvestigation: vi.fn().mockResolvedValue({ ok: true }),
    splitTransaction: vi.fn().mockResolvedValue({ ok: true }),
    uploadBankStatementCsv: vi.fn().mockResolvedValue({ added: 0, errors: [] }),
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

function tx(id: string, accountId: string, amountCents: number, date = "2026-05-17T00:00:00.000Z", description = "Txn") {
  return {
    id,
    bank_account_id: accountId,
    transaction_date: date,
    posted_date: null,
    amount_cents: amountCents,
    description,
    merchant_name: null,
    plaid_category: [],
    pending: false,
    is_credit: amountCents < 0,
    matched_load_id: null,
    matched_bill_id: null,
    matched_settlement_id: null,
    institution_name: "Test Bank",
    account_name: "Operating",
    account_mask: "1234",
    matched_kind: null,
    notes: null,
    created_at: "2026-05-17T10:00:00.000Z",
  };
}

function StatefulTransactionsView(props: Omit<Parameters<typeof BankingTransactionsDesignView>[0], "selectedAccountId" | "onSelectAccount">) {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(props.accounts[0]?.id ?? null);
  return <BankingTransactionsDesignView {...props} selectedAccountId={selectedAccountId} onSelectAccount={setSelectedAccountId} />;
}

describe("BankingTransactionsDesignView date formatting", () => {
  it("renders required QBO parity controls and MM/DD/YYYY dates", async () => {
    vi.stubGlobal("print", vi.fn());
    vi.mocked(bankingApi.getPlaidCompanyTransactions).mockResolvedValue({
      transactions: [
        {
          id: "tx-iso-1",
          bank_account_id: "acct-1",
          transaction_date: "2026-05-17T00:00:00.000Z",
          posted_date: null,
          amount_cents: 12500,
          description: "Fuel station",
          merchant_name: null,
          plaid_category: [],
          pending: false,
          is_credit: false,
          matched_load_id: null,
          matched_bill_id: null,
          matched_settlement_id: null,
          institution_name: "Chase",
          account_name: "Operating",
          account_mask: "1234",
          matched_kind: null,
          notes: null,
          created_at: "2026-05-17T10:00:00.000Z",
        },
      ],
    });

    render(
      wrap(
        <BankingTransactionsDesignView
          companyId="company-1"
          accounts={[
            {
              id: "acct-1",
              operating_company_id: "company-1",
              institution_name: "Chase",
              account_name: "Operating",
              account_mask: "1234",
              account_type: "depository",
              current_balance_cents: 100000,
              available_balance_cents: 100000,
              currency_code: "USD",
              is_active: true,
              sync_status: "active",
              last_synced_at: null,
              plaid_item_id: "item-1",
              created_at: "2026-05-01T00:00:00.000Z",
              updated_at: "2026-05-01T00:00:00.000Z",
            },
          ]}
          selectedAccountId="acct-1"
          onSelectAccount={() => {}}
          onManageConnections={() => {}}
          onDataChanged={() => {}}
        />
      )
    );

    expect(await screen.findByRole("button", { name: "For review · 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Categorized · 0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluded · 0" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Filter by description")).toBeInTheDocument();
    expect(screen.getByText("Categorize by")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse all groupings" })).toBeInTheDocument();
    expect(screen.getByText("May 2026 (1)")).toBeInTheDocument();
    expect(await screen.findByText("05/17/2026")).toBeInTheDocument();
    expect(screen.getByText("1-1 of 1")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.queryByText("2026-05-17T00:00:00.000Z")).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("maps money-in transactions to Received and filters by Received", async () => {
    vi.mocked(bankingApi.getPlaidCompanyTransactions).mockResolvedValue({
      transactions: [
        {
          id: "tx-money-out",
          bank_account_id: "acct-1",
          transaction_date: "2026-05-17T00:00:00.000Z",
          posted_date: null,
          amount_cents: 12000,
          description: "Fuel purchase",
          merchant_name: null,
          plaid_category: [],
          pending: false,
          is_credit: false,
          matched_load_id: null,
          matched_bill_id: null,
          matched_settlement_id: null,
          institution_name: "Amex",
          account_name: "Business Platinum Card",
          account_mask: "9999",
          matched_kind: null,
          notes: null,
          created_at: "2026-05-17T10:00:00.000Z",
        },
        {
          id: "tx-money-in",
          bank_account_id: "acct-1",
          transaction_date: "2026-05-18T00:00:00.000Z",
          posted_date: null,
          amount_cents: -4550,
          description: "ONLINE PAYMENT - THANK YOU",
          merchant_name: null,
          plaid_category: ["Transfer"],
          pending: false,
          is_credit: false,
          matched_load_id: null,
          matched_bill_id: null,
          matched_settlement_id: null,
          institution_name: "Amex",
          account_name: "Business Platinum Card",
          account_mask: "9999",
          matched_kind: null,
          notes: null,
          created_at: "2026-05-18T10:00:00.000Z",
        },
      ],
    });

    render(
      wrap(
        <BankingTransactionsDesignView
          companyId="company-1"
          accounts={[
            {
              id: "acct-1",
              operating_company_id: "company-1",
              institution_name: "Amex",
              account_name: "Business Platinum Card",
              account_mask: "9999",
              account_type: "credit",
              current_balance_cents: 100000,
              available_balance_cents: 100000,
              currency_code: "USD",
              is_active: true,
              sync_status: "active",
              last_synced_at: null,
              plaid_item_id: "item-1",
              created_at: "2026-05-01T00:00:00.000Z",
              updated_at: "2026-05-01T00:00:00.000Z",
            },
          ]}
          selectedAccountId="acct-1"
          onSelectAccount={() => {}}
          onManageConnections={() => {}}
          onDataChanged={() => {}}
        />
      )
    );

    expect(spentReceived({
      id: "money-in-sign",
      transaction_date: "2026-05-18",
      posted_date: null,
      amount_cents: -4550,
      description: null,
      merchant_name: null,
      plaid_category: [],
      pending: false,
      is_credit: false,
      matched_load_id: null,
      matched_bill_id: null,
      matched_settlement_id: null,
      notes: null,
      created_at: "2026-05-18T10:00:00.000Z",
    })).toEqual({ spent: 0, received: 4550 });

    expect(await screen.findByText("For review · 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Received" }));
    expect(screen.getByText("1-1 of 1")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(screen.getByText("$45.50")).toBeInTheDocument();
    expect(screen.queryByText("Fuel purchase")).not.toBeInTheDocument();
  });

  it("filters by selected account chip and fetches beyond a fixed 300 row cap", async () => {
    vi.mocked(bankingApi.getPlaidCompanyTransactions).mockImplementation(async (_companyId, options) => {
      const accountId = options?.bank_account_id ?? "acct-1";
      const offset = Number(options?.offset ?? 0);
      if (accountId === "acct-1") {
        if (offset === 0) return { transactions: Array.from({ length: 500 }, (_, index) => tx(`a1-${index}`, "acct-1", 1000, "2026-05-17T00:00:00.000Z", `Acct1 ${index}`)) };
        if (offset === 500) return { transactions: Array.from({ length: 120 }, (_, index) => tx(`a1b-${index}`, "acct-1", 1000, "2026-05-16T00:00:00.000Z", `Acct1b ${index}`)) };
        return { transactions: [] };
      }
      if (offset === 0) return { transactions: [tx("acct2-1", "acct-2", 2500, "2026-05-18T00:00:00.000Z", "Acct2 only row")] };
      return { transactions: [] };
    });

    render(
      wrap(
        <StatefulTransactionsView
          companyId="company-1"
          accounts={[
            {
              id: "acct-1",
              operating_company_id: "company-1",
              institution_name: "Bank A",
              account_name: "Operating",
              account_mask: "1111",
              account_type: "depository",
              current_balance_cents: 100000,
              available_balance_cents: 100000,
              currency_code: "USD",
              is_active: true,
              sync_status: "active",
              last_synced_at: null,
              plaid_item_id: "item-1",
              created_at: "2026-05-01T00:00:00.000Z",
              updated_at: "2026-05-01T00:00:00.000Z",
            },
            {
              id: "acct-2",
              operating_company_id: "company-1",
              institution_name: "Bank B",
              account_name: "Business Platinum Card",
              account_mask: "5007",
              account_type: "credit",
              current_balance_cents: 100000,
              available_balance_cents: 100000,
              currency_code: "USD",
              is_active: true,
              sync_status: "active",
              last_synced_at: null,
              plaid_item_id: "item-2",
              created_at: "2026-05-01T00:00:00.000Z",
              updated_at: "2026-05-01T00:00:00.000Z",
            },
          ]}
          onManageConnections={() => {}}
          onDataChanged={() => {}}
        />
      )
    );

    expect(await screen.findByRole("button", { name: "For review · 620" })).toBeInTheDocument();
    expect(screen.getByText("1-50 of 620")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 13")).toBeInTheDocument();
    expect(vi.mocked(bankingApi.getPlaidCompanyTransactions)).toHaveBeenCalledWith(
      "company-1",
      expect.objectContaining({ bank_account_id: "acct-1", limit: 500, offset: 500, sort: "date_desc" })
    );

    fireEvent.click(screen.getByRole("button", { name: /Business Platinum Card/i }));

    expect(await screen.findByRole("button", { name: "For review · 1" })).toBeInTheDocument();
    expect(screen.getByText("1-1 of 1")).toBeInTheDocument();
    expect(screen.getAllByText("Acct2 only row").length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(vi.mocked(bankingApi.getPlaidCompanyTransactions)).toHaveBeenCalledWith(
        "company-1",
        expect.objectContaining({ bank_account_id: "acct-2", limit: 500, offset: 0, sort: "date_desc" })
      )
    );
  });
});
