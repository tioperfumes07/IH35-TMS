import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationTransactionsPage } from "../IntegrationTransactionsPage";
import { InvoiceCreateModal } from "../InvoiceCreateModal";
import { RecordPaymentModal } from "../RecordPaymentModal";
import { CoaRolesPage } from "../CoaRolesPage";
import { FactorReconciliationPage } from "../FactorReconciliationPage";
import { SalesTaxPage } from "../SalesTaxPage";
import { useInvoiceCreateFromLoad } from "../../../hooks/useInvoiceCreateFromLoad";
import { useQuery } from "@tanstack/react-query";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  useNavigate: () => vi.fn(),
  // SalesTaxPage reads ?return_id= to highlight the deep-linked row (EntityLink
  // kind="sales_tax_return" drill-through) — no highlight target in these tests.
  useSearchParams: () => [new URLSearchParams()],
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "company-1" }),
}));

vi.mock("../AccountingSubNavWrapper", () => ({
  AccountingSubNavWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../../components/layout/DataPanel", () => ({
  DataPanel: ({ title, children }: { title: string; children: ReactNode }) => <section aria-label={title}>{children}</section>,
}));

vi.mock("../../../components/parity/ParityTable", () => ({
  ParityTable: () => <div data-testid="parity-table" />,
}));

vi.mock("../../../components/Modal", () => ({
  Modal: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
}));

vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock("../../../components/UploadZone", () => ({ UploadZone: () => null }));
vi.mock("../../../components/Combobox", () => ({ Combobox: () => <div data-testid="customer-combobox" /> }));
vi.mock("../../../components/forms/DatePicker", () => ({ DatePicker: () => <input aria-label="date-picker" /> }));
vi.mock("../../../components/forms/MoneyInput", () => ({ MoneyInput: () => <input aria-label="money-input" /> }));
vi.mock("../InvoiceCreateBlankPage", () => ({ InvoiceCreateBlankPage: () => null }));
vi.mock("../../../hooks/useInvoiceCreateFromLoad", () => ({ useInvoiceCreateFromLoad: vi.fn() }));

vi.mock("../../../api/accounting", () => ({
  createPayment: vi.fn(),
  listInvoices: vi.fn(),
  listCoaAccountsForJe: vi.fn(),
  listCoaRoles: vi.fn(),
  upsertCoaRole: vi.fn(),
  validateCoaRoles: vi.fn(),
  COA_ROLE_VALUES: [],
  importFactorReconciliationRun: vi.fn(),
  listFactorReconciliationItems: vi.fn(),
  listFactorReconciliationRuns: vi.fn(),
  listFactorReconciliationImportCandidates: vi.fn(),
  createSalesTaxAgency: vi.fn(),
  fileSalesTaxReturn: vi.fn(),
  listSalesTaxAgencies: vi.fn(),
  listSalesTaxReturns: vi.fn(),
  markSalesTaxReturnPaid: vi.fn(),
  prepareSalesTaxReturn: vi.fn(),
}));

vi.mock("../../../api/mdata", () => ({ listCustomers: vi.fn() }));
vi.mock("../../../api/integration-transactions", () => ({ getIntegrationTransactions: vi.fn() }));

type QueryResult = {
  data?: unknown;
  error?: Error | null;
  isError?: boolean;
  isLoading?: boolean;
  isPending?: boolean;
  isFetching?: boolean;
  refetch: ReturnType<typeof vi.fn>;
};

const queryResults = new Map<string, QueryResult>();

function queryResult(data?: unknown): QueryResult {
  return {
    data,
    error: null,
    isError: false,
    isLoading: false,
    isPending: false,
    isFetching: false,
    refetch: vi.fn(),
  };
}

function failedQuery(message: string): QueryResult {
  return { ...queryResult(), error: new Error(message), isError: true };
}

function keyOf(value: unknown) {
  return JSON.stringify(value);
}

beforeEach(() => {
  queryResults.clear();
  vi.mocked(useQuery).mockImplementation((options: { queryKey: unknown }) => {
    const result = queryResults.get(keyOf(options.queryKey));
    if (!result) throw new Error(`Missing query test fixture: ${keyOf(options.queryKey)}`);
    return result as never;
  });
});

describe("Accounting Wave A query error states", () => {
  it("renders the integration transaction failure before the table and retries txnQuery", () => {
    const failure = failedQuery("sync queue unavailable");
    queryResults.set(keyOf(["integration-transactions", "company-1", "", "", ""]), failure);

    render(<IntegrationTransactionsPage />);

    expect(screen.getByText(/Failed to load integration transactions: sync queue unavailable/)).toBeInTheDocument();
    expect(screen.queryByTestId("parity-table")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(failure.refetch).toHaveBeenCalledOnce();
  });

  it("renders the invoiceable-load failure in the from-load step and retries loadsQuery", () => {
    const refetchLoads = vi.fn();
    vi.mocked(useInvoiceCreateFromLoad).mockReturnValue({
      loads: [],
      totalCount: 0,
      page: 1,
      pageSize: 25,
      isLoading: false,
      isError: true,
      error: new Error("loads unavailable"),
      refetchLoads,
      createFromLoad: vi.fn(),
      isCreating: false,
    } as never);

    render(<InvoiceCreateModal open operatingCompanyId="company-1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /From an existing load/i }));

    expect(screen.getByText(/Failed to load invoiceable loads: loads unavailable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refetchLoads).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: "customersQuery",
      customerId: undefined,
      failedKey: ["record-payment", "customers", "company-1"],
      otherKey: ["record-payment", "open-invoices", "company-1", null],
      message: "Failed to load customers: customers unavailable",
      otherData: [],
    },
    {
      name: "openInvoicesQuery",
      customerId: "customer-1",
      failedKey: ["record-payment", "open-invoices", "company-1", "customer-1"],
      otherKey: ["record-payment", "customers", "company-1"],
      message: "Failed to load open invoices: invoices unavailable",
      otherData: [],
    },
  ])("renders and retries the scoped $name failure", ({ customerId, failedKey, otherKey, message, otherData }) => {
    const failure = failedQuery(message.includes("customers") ? "customers unavailable" : "invoices unavailable");
    queryResults.set(keyOf(failedKey), failure);
    queryResults.set(keyOf(otherKey), queryResult(otherData));
    // depositCatalogQuery (RecordPaymentModal.tsx) — a real third query added since this harness
    // was last updated; not under test here, so a plain successful empty result in its real
    // shape ({ bankAccounts, coaAccounts, undepositedFundsAccountId }, not a bare array).
    queryResults.set(
      keyOf(["record-payment", "deposit-catalog", "company-1"]),
      queryResult({ bankAccounts: [], coaAccounts: [], undepositedFundsAccountId: null })
    );

    render(
      <RecordPaymentModal
        open
        operatingCompanyId="company-1"
        onClose={vi.fn()}
        onRecorded={vi.fn()}
        prefillCustomerId={customerId}
      />,
    );

    expect(screen.getByText(message)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(failure.refetch).toHaveBeenCalledOnce();
  });

  it("renders the CoA validation failure and retries validateQuery", () => {
    queryResults.set(keyOf(["coa-roles", "company-1"]), queryResult({ rows: [] }));
    // Real key is company-scoped (CoaRolesPage.tsx: ["coa-roles", "accounts", companyId]).
    // A non-empty accounts list, not [] — an empty result now renders its own honest "No
    // postable accounts" ListErrorBanner (a real, separate improvement), which would add a
    // second "Refresh" button and break this test's single-failure assertion below.
    queryResults.set(keyOf(["coa-roles", "accounts", "company-1"]), queryResult({ accounts: [{ id: "a1", name: "Checking" }] }));
    const failure = failedQuery("validation unavailable");
    queryResults.set(keyOf(["coa-roles", "validate", "company-1"]), failure);

    render(<CoaRolesPage />);

    expect(screen.getByText(/Failed to validate CoA role mappings: validation unavailable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(failure.refetch).toHaveBeenCalledOnce();
  });

  it("renders the selected reconciliation item failure and retries itemsQuery", () => {
    queryResults.set(keyOf(["accounting", "factor-reconciliation-runs", "company-1"]), queryResult([{
      id: "run-1",
      statement_date: "2026-07-18",
      status: "open",
      mismatch_count: 0,
      item_count: 0,
      total_advances_cents: 0,
      total_fees_cents: 0,
      total_reserves_released_cents: 0,
    }]));
    queryResults.set(keyOf(["accounting", "factor-reconciliation-import-candidates", "company-1"]), queryResult([]));
    queryResults.set(keyOf(["accounting", "factor-reconciliation-items", "company-1", ""]), queryResult([]));
    const failure = failedQuery("items unavailable");
    queryResults.set(keyOf(["accounting", "factor-reconciliation-items", "company-1", "run-1"]), failure);

    render(<FactorReconciliationPage />);
    fireEvent.click(screen.getByRole("button", { name: /07\/18\/2026/i }));

    expect(screen.getByText(/Failed to load reconciliation items: items unavailable/)).toBeInTheDocument();
    expect(screen.queryByText("Mismatches:")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Statement invoice" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(failure.refetch).toHaveBeenCalledOnce();
  });

  it("renders the sales-tax agency failure and retries agenciesQuery", () => {
    const failure = failedQuery("agencies unavailable");
    queryResults.set(keyOf(["sales-tax", "agencies", "company-1"]), failure);
    queryResults.set(keyOf(["sales-tax", "returns", "company-1"]), queryResult({ returns: [] }));

    render(<SalesTaxPage />);

    expect(screen.getByText(/Failed to load sales tax agencies: agencies unavailable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(failure.refetch).toHaveBeenCalledOnce();
  });
});
