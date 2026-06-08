import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chartOfAccountsCatalogClient } from "../../../../api/catalogs-accounting";
import { fetchAccountBalances, fetchAccountTypeCatalog } from "../../../../api/coa-list";
import { getPlaidBankAccounts } from "../../../../api/banking";
import { ChartOfAccountsListPage } from "../ChartOfAccountsListPage";

vi.mock("../../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    companies: [],
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: vi.fn(),
    setDefaultCompanyForUser: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../../../../api/coa-list", async () => {
  const actual = await vi.importActual<typeof import("../../../../api/coa-list")>("../../../../api/coa-list");
  return {
    ...actual,
    fetchAccountTypeCatalog: vi.fn(),
    fetchAccountBalances: vi.fn(),
    deactivateCatalogAccount: vi.fn(),
  };
});

vi.mock("../../../../api/banking", async () => {
  const actual = await vi.importActual<typeof import("../../../../api/banking")>("../../../../api/banking");
  return {
    ...actual,
    getPlaidBankAccounts: vi.fn(),
  };
});

describe("ChartOfAccountsListPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders QBO-parity columns on the ListView table", async () => {
    vi.spyOn(chartOfAccountsCatalogClient, "list").mockResolvedValue({
      rows: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          code: "1000",
          display_name: "Cash Operating",
          description: null,
          metadata: {
            account_type: "Asset",
            account_subtype: "Checking",
            qbo_account_id: "42",
          },
          is_active: true,
          sort_order: 1,
          created_at: "2026-06-07T00:00:00.000Z",
          updated_at: "2026-06-07T00:00:00.000Z",
        },
      ],
      total: 1,
    });
    vi.mocked(fetchAccountTypeCatalog).mockResolvedValue([
      {
        id: "type-1",
        code: "BANK",
        accountType: "Bank",
        group: "ASSET",
        statement: "BS",
        normalBalance: "Debit",
        defaultAction: "view_register",
        sortOrder: 10,
        detailTypes: [{ id: "dt-1", name: "Checking", sortOrder: 20 }],
      },
    ]);
    vi.mocked(fetchAccountBalances).mockResolvedValue({
      accounts: [
        {
          account_id: "11111111-1111-4111-8111-111111111111",
          account_code: "1000",
          account_name: "Cash Operating",
          account_type: "Asset",
          normal_balance: "debit",
          opening_balance_cents: 0,
          period_debits_cents: 0,
          period_credits_cents: 0,
          period_activity_cents: 0,
          closing_balance_cents: 125000,
        },
      ],
      as_of_date: "2026-06-07",
      from_date: null,
      basis: "accrual",
      generated_at: "2026-06-07T00:00:00.000Z",
    });
    vi.mocked(getPlaidBankAccounts).mockResolvedValue({ accounts: [] });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ChartOfAccountsListPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText("Cash Operating")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Chart of Accounts" })).toBeInTheDocument();
    expect(screen.getByText("NUMBER")).toBeInTheDocument();
    expect(screen.getByText("ACCOUNT TYPE")).toBeInTheDocument();
    expect(screen.getByText("DETAIL TYPE")).toBeInTheDocument();
    expect(screen.getByText("QUICKBOOKS BALANCE")).toBeInTheDocument();
    expect(screen.getByText("BANK BALANCE")).toBeInTheDocument();
    expect(screen.getByText("$1,250.00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View register" })).toHaveAttribute(
      "href",
      "/accounting/chart-of-accounts/register/11111111-1111-4111-8111-111111111111"
    );
  });
});
