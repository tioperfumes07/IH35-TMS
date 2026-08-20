import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "@tanstack/react-query";
import { CreateMultipleBillsPage } from "../CreateMultipleBillsPage";
import { SubmitFactoringModal } from "../SubmitFactoringModal";
import { InvoicesListPage } from "../InvoicesListPage";
import { BillPaymentsListPage } from "../BillPaymentsListPage";
import { RecurringBillCreate } from "../bills/RecurringBillCreate";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  useLocation: () => ({ state: null }),
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams()],
}));

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "company-1" }),
}));
vi.mock("../../../auth/useAuth", () => ({ useAuth: () => ({ user: { role: "Owner" } }) }));
vi.mock("../../../components/Toast", () => ({ useToast: () => ({ pushToast: vi.fn() }) }));
vi.mock("../AccountingSubNavWrapper", () => ({
  AccountingSubNavWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../../components/Modal", () => ({
  Modal: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
}));
vi.mock("../../../components/parity/ParityDrawer", () => ({
  ParityDrawer: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
}));
vi.mock("../../../components/layout/DataPanel", () => ({
  DataPanel: ({ children }: { children: ReactNode }) => <section>{children}</section>,
}));
vi.mock("../../../components/parity/ParityTable", () => ({
  ParityTable: ({ filterBar }: { filterBar?: ReactNode }) => <div>{filterBar}</div>,
}));
vi.mock("../../../components/parity/ReferenceSelect", () => ({ ReferenceSelect: () => <div data-testid="reference-select" /> }));
vi.mock("../../../components/shared/EntityLink", () => ({ EntityLink: ({ label }: { label?: string }) => <span>{label}</span> }));
vi.mock("../../../components/shared/SelectCombobox", () => ({
  SelectCombobox: ({ children }: { children: ReactNode }) => <select>{children}</select>,
}));
vi.mock("../../../components/Button", () => ({
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
}));
vi.mock("../../../components/forms/DatePicker", () => ({ DatePicker: () => <input aria-label="date-picker" /> }));
vi.mock("../../../components/forms/MoneyInput", () => ({ MoneyInput: () => <input aria-label="money-input" /> }));
vi.mock("../../../components/layout/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("../../../components/bulk", () => ({ BulkActionModal: () => null, BulkProgressDialog: () => null }));
vi.mock("../../../components/bulk/useEntityBulkAction", () => ({
  useEntityBulkAction: () => ({
    runBulk: vi.fn(),
    progressOpen: false,
    progressLoading: false,
    progress: { requested: 0, succeeded: 0, failed: 0, bulk_call_id: "" },
    setProgressOpen: vi.fn(),
  }),
}));
vi.mock("../../../components/accounting/VoidReasonModal", () => ({ VoidReasonModal: () => null }));
vi.mock("../BillDetailPanel", () => ({ BillDetailPanel: () => null }));
vi.mock("../PayBillModal", () => ({ PayBillModal: () => null }));
vi.mock("../bill-payments/CCPaymentModal", () => ({ CCPaymentModal: () => null }));
vi.mock("../InvoiceCreateModal", () => ({ InvoiceCreateModal: () => null }));
vi.mock("../modals/CustomerAdjustmentModal", () => ({ CustomerAdjustmentModal: () => null }));
vi.mock("../modals/DriverDamageInvoiceModal", () => ({ DriverDamageInvoiceModal: () => null }));
vi.mock("../modals/DriverMiscInvoiceModal", () => ({ DriverMiscInvoiceModal: () => null }));
vi.mock("../modals/ManualInvoiceModal", () => ({ ManualInvoiceModal: () => null }));
vi.mock("../modals/VendorChargebackModal", () => ({ VendorChargebackModal: () => null }));

vi.mock("../../../api/accounting", () => ({
  createRecurringBillTemplate: vi.fn(),
  createVendorBill: vi.fn(),
  listBillPayments: vi.fn(),
  listBills: vi.fn(),
  listFactoringCandidateInvoices: vi.fn(),
  listInvoices: vi.fn(),
  submitFactoringBatch: vi.fn(),
  voidVendorBillPayment: vi.fn(),
}));
vi.mock("../../../api/banking", () => ({ getCoaAccounts: vi.fn() }));
vi.mock("../../../api/factoring", () => ({ getFactoringSummary: vi.fn() }));
vi.mock("../../../api/mdata", () => ({ listCustomers: vi.fn(), listVendors: vi.fn() }));

type QueryResult = {
  data?: unknown;
  error?: Error | null;
  isError: boolean;
  isLoading: boolean;
  isPending: boolean;
  isFetching: boolean;
  refetch: ReturnType<typeof vi.fn>;
};

const results = new Map<string, QueryResult>();
const keyOf = (key: unknown) => JSON.stringify(key);
const success = (data?: unknown): QueryResult => ({
  data,
  error: null,
  isError: false,
  isLoading: false,
  isPending: false,
  isFetching: false,
  refetch: vi.fn(),
});
const failure = (message: string): QueryResult => ({ ...success(), error: new Error(message), isError: true });

beforeEach(() => {
  results.clear();
  vi.mocked(useQuery).mockImplementation((options: { queryKey: unknown }) => {
    const result = results.get(keyOf(options.queryKey));
    if (!result) throw new Error(`Missing query fixture: ${keyOf(options.queryKey)}`);
    return result as never;
  });
});

function expectVisibleRetry(message: RegExp, query: QueryResult) {
  expect(screen.getByText(message)).toBeInTheDocument();
  const banner = screen.getByText(message).closest("div");
  const retry = banner?.querySelector("button");
  expect(retry).not.toBeNull();
  fireEvent.click(retry!);
  expect(query.refetch).toHaveBeenCalledOnce();
}

describe("Accounting Wave B query error states", () => {
  it("renders and retries CreateMultipleBillsPage vendorsQuery without a coaQuery error", () => {
    const failed = failure("vendors unavailable");
    results.set(keyOf(["multi-bills", "vendors", "company-1"]), failed);
    results.set(keyOf(["multi-bills", "coa", "company-1"]), success({ accounts: [] }));

    render(<CreateMultipleBillsPage />);
    expect(screen.queryByText(/Failed to load A\/P accounts for bill rows:/)).not.toBeInTheDocument();
    expectVisibleRetry(/Failed to load vendors for bill rows: vendors unavailable/, failed);
  });

  it("renders and retries CreateMultipleBillsPage coaQuery without a vendorsQuery error", () => {
    const failed = failure("accounts unavailable");
    results.set(keyOf(["multi-bills", "vendors", "company-1"]), success({ vendors: [] }));
    results.set(keyOf(["multi-bills", "coa", "company-1"]), failed);

    render(<CreateMultipleBillsPage />);
    expect(screen.queryByText(/Failed to load vendors for bill rows:/)).not.toBeInTheDocument();
    expectVisibleRetry(/Failed to load A\/P accounts for bill rows: accounts unavailable/, failed);
  });

  it("renders and retries SubmitFactoringModal vendorsQuery without co-query errors", () => {
    const failed = failure("vendors unavailable");
    results.set(keyOf(["factoring-vendors", "company-1"]), failed);
    results.set(keyOf(["factoring-candidates", "company-1"]), success([]));
    results.set(keyOf(["factoring", "summary", "company-1"]), success({}));
    results.set(keyOf(["factoring", "factors", "company-1", "active"]), success([]));

    render(<SubmitFactoringModal open operatingCompanyId="company-1" onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.queryByText(/Failed to load eligible invoices:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed to load factoring defaults:/)).not.toBeInTheDocument();
    expectVisibleRetry(/Failed to load factoring companies: vendors unavailable/, failed);
  });

  it("renders and retries SubmitFactoringModal invoicesQuery without co-query errors", () => {
    const failed = failure("invoices unavailable");
    results.set(keyOf(["factoring-vendors", "company-1"]), success([]));
    results.set(keyOf(["factoring-candidates", "company-1"]), failed);
    results.set(keyOf(["factoring", "summary", "company-1"]), success({}));
    results.set(keyOf(["factoring", "factors", "company-1", "active"]), success([]));

    render(<SubmitFactoringModal open operatingCompanyId="company-1" onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.queryByText(/Failed to load factoring companies:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed to load factoring defaults:/)).not.toBeInTheDocument();
    expectVisibleRetry(/Failed to load eligible invoices: invoices unavailable/, failed);
  });

  it("renders and retries SubmitFactoringModal factoringSummaryQuery without co-query errors", () => {
    const failed = failure("summary unavailable");
    results.set(keyOf(["factoring-vendors", "company-1"]), success([]));
    results.set(keyOf(["factoring-candidates", "company-1"]), success([]));
    results.set(keyOf(["factoring", "summary", "company-1"]), failed);
    results.set(keyOf(["factoring", "factors", "company-1", "active"]), success([]));

    render(<SubmitFactoringModal open operatingCompanyId="company-1" onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.queryByText(/Failed to load factoring companies:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed to load eligible invoices:/)).not.toBeInTheDocument();
    expectVisibleRetry(/Failed to load factoring defaults: summary unavailable/, failed);
  });

  it("renders and retries InvoicesListPage customersQuery without an invoices query error", () => {
    const failed = failure("customers unavailable");
    results.set(keyOf(["mdata", "customers", "invoice-filter", "company-1"]), failed);
    results.set(keyOf(["accounting", "invoices", "company-1", "", false, "", "", "", "", null]), success({ invoices: [] }));

    render(<InvoicesListPage />);
    expect(screen.queryByText("Failed to load. Try refreshing.")).not.toBeInTheDocument();
    expectVisibleRetry(/Failed to load customer filters: customers unavailable/, failed);
  });

  it("renders and retries BillPaymentsListPage unpaidBillsQuery without a payments query error", () => {
    results.set(keyOf(["accounting", "bill-payments-list", "company-1", "", "", ""]), success({ rows: [] }));
    const failed = failure("unpaid bills unavailable");
    results.set(keyOf(["accounting", "bills-has-balance", "company-1"]), failed);

    render(<BillPaymentsListPage />);
    expect(screen.queryByText("Failed to load. Try refreshing.")).not.toBeInTheDocument();
    expectVisibleRetry(/Failed to load unpaid bills: unpaid bills unavailable/, failed);
  });

  it("renders and retries RecurringBillCreate vendorsQuery", () => {
    const failed = failure("vendors unavailable");
    results.set(keyOf(["mdata", "vendors", "company-1"]), failed);
    // coaQuery — a real second query added since this harness was last updated; not under test.
    results.set(keyOf(["recurring-bill", "coa", "company-1"]), success({ accounts: [] }));

    render(<RecurringBillCreate />);
    expectVisibleRetry(/Failed to load recurring-bill vendors: vendors unavailable/, failed);
  });
});
