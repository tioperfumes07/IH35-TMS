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
  it.each([
    {
      name: "vendorsQuery",
      failedKey: ["multi-bills", "vendors", "company-1"],
      otherKey: ["multi-bills", "coa", "company-1"],
      message: /Failed to load vendors for bill rows: vendors unavailable/,
    },
    {
      name: "coaQuery",
      failedKey: ["multi-bills", "coa", "company-1"],
      otherKey: ["multi-bills", "vendors", "company-1"],
      message: /Failed to load A\/P accounts for bill rows: accounts unavailable/,
    },
  ])("renders and retries CreateMultipleBillsPage $name", ({ failedKey, otherKey, message }) => {
    const failed = failure(message.source.includes("vendors") ? "vendors unavailable" : "accounts unavailable");
    results.set(keyOf(failedKey), failed);
    results.set(keyOf(otherKey), success(message.source.includes("vendors") ? { accounts: [] } : { vendors: [] }));

    render(<CreateMultipleBillsPage />);
    expectVisibleRetry(message, failed);
  });

  it.each([
    {
      name: "vendorsQuery",
      failedKey: ["factoring-vendors", "company-1"],
      message: /Failed to load factoring companies: vendors unavailable/,
    },
    {
      name: "invoicesQuery",
      failedKey: ["factoring-candidates", "company-1"],
      message: /Failed to load eligible invoices: invoices unavailable/,
    },
    {
      name: "factoringSummaryQuery",
      failedKey: ["factoring", "summary", "company-1"],
      message: /Failed to load factoring defaults: summary unavailable/,
    },
  ])("renders and retries SubmitFactoringModal $name", ({ name, failedKey, message }) => {
    const fixtures = [
      ["factoring-vendors", "company-1"],
      ["factoring-candidates", "company-1"],
      ["factoring", "summary", "company-1"],
    ];
    for (const key of fixtures) results.set(keyOf(key), success(key[0] === "factoring" ? {} : []));
    const failed = failure(name === "vendorsQuery" ? "vendors unavailable" : name === "invoicesQuery" ? "invoices unavailable" : "summary unavailable");
    results.set(keyOf(failedKey), failed);

    render(<SubmitFactoringModal open operatingCompanyId="company-1" onClose={vi.fn()} onCreated={vi.fn()} />);
    expectVisibleRetry(message, failed);
  });

  it("renders and retries InvoicesListPage customersQuery", () => {
    const failed = failure("customers unavailable");
    results.set(keyOf(["mdata", "customers", "invoice-filter", "company-1"]), failed);
    results.set(keyOf(["accounting", "invoices", "company-1", "", "", "", "", ""]), success([]));

    render(<InvoicesListPage />);
    expectVisibleRetry(/Failed to load customer filters: customers unavailable/, failed);
  });

  it("renders and retries BillPaymentsListPage unpaidBillsQuery", () => {
    results.set(keyOf(["accounting", "bill-payments-list", "company-1", "", "", ""]), success({ rows: [] }));
    const failed = failure("unpaid bills unavailable");
    results.set(keyOf(["accounting", "bills-unpaid", "company-1"]), failed);

    render(<BillPaymentsListPage />);
    expectVisibleRetry(/Failed to load unpaid bills: unpaid bills unavailable/, failed);
  });

  it("renders and retries RecurringBillCreate vendorsQuery", () => {
    const failed = failure("vendors unavailable");
    results.set(keyOf(["mdata", "vendors", "company-1"]), failed);

    render(<RecurringBillCreate />);
    expectVisibleRetry(/Failed to load recurring-bill vendors: vendors unavailable/, failed);
  });
});
