import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as bankingApi from "../../../api/banking";
import { ToastProvider } from "../../../components/Toast";
import { BankingTransactionsDesignView } from "./BankingTransactionsDesignView";

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

describe("BankingTransactionsDesignView date formatting", () => {
  it("renders MM/DD/YYYY and not raw ISO timestamp", async () => {
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

    expect(await screen.findByText("05/17/2026")).toBeInTheDocument();
    expect(screen.queryByText("2026-05-17T00:00:00.000Z")).not.toBeInTheDocument();
  });
});
