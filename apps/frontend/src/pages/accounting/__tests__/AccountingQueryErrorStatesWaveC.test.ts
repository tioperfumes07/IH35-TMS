import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ReactElement, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as accountingApi from "../../../api/accounting";
import * as bankingApi from "../../../api/banking";
import * as mdataApi from "../../../api/mdata";
import * as paymentMethodsApi from "../../../api/paymentMethods";
import { BillsPage } from "../BillsPage";
import { CashForecastPage } from "../CashForecastPage";
import { ExpenseCategoryMapPage } from "../ExpenseCategoryMapPage";
import { PayBillModal } from "../PayBillModal";
import { PaymentDetailPage } from "../PaymentDetailPage";
import { PaymentMethodsCatalogPage } from "../PaymentMethodsCatalogPage";
import { ReconciliationWorkspacePage } from "../ReconciliationWorkspacePage";
import { CCPaymentModal } from "../bill-payments/CCPaymentModal";

const COMPANY_ID = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
const QUERY_ERROR = new Error("planted query failure");

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: COMPANY_ID }),
}));

vi.mock("../../../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "Owner" } }),
}));

vi.mock("../../../components/Toast", () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => children,
  useToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock("../../../components/bulk/useEntityBulkAction", () => ({
  useEntityBulkAction: () => ({
    runBulk: vi.fn(),
    progressOpen: false,
    setProgressOpen: vi.fn(),
    progressLoading: false,
    progress: { requested: 0, succeeded: 0, failed: [], bulk_call_id: "" },
  }),
}));

vi.mock("../../../api/accounting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/accounting")>();
  return {
    ...actual,
    getAccountingReconciliationWorkspace: vi.fn(),
    getCashForecast: vi.fn(),
    getCashForecastSettings: vi.fn(),
    getPayment: vi.fn(),
    listBills: vi.fn(),
    listCoaAccountsForJe: vi.fn(),
    listExpenseCategoryMappings: vi.fn(),
    listInvoices: vi.fn(),
    listPaymentsForBill: vi.fn(),
  };
});

vi.mock("../../../api/banking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/banking")>();
  return {
    ...actual,
    getAllAccounts: vi.fn(),
    getCoaAccounts: vi.fn(),
    getPlaidBankAccounts: vi.fn(),
  };
});

vi.mock("../../../api/mdata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/mdata")>();
  return { ...actual, listVendors: vi.fn() };
});

vi.mock("../../../api/paymentMethods", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/paymentMethods")>();
  return { ...actual, listPaymentMethods: vi.fn() };
});

vi.mock("recharts", () => ({
  CartesianGrid: () => null,
  Line: () => null,
  LineChart: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  ResponsiveContainer: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

function renderSurface(ui: ReactElement, initialEntry = "/accounting") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(QueryClientProvider, { client }, ui),
    ),
  );
}

function bill() {
  return {
    id: "bill-1",
    operating_company_id: COMPANY_ID,
    vendor_id: "vendor-1",
    vendor_name: "Vendor One",
    bill_number: "B-100",
    bill_date: "2026-07-01",
    due_date: "2026-07-15",
    amount_cents: 10_000,
    paid_cents: 4_000,
    balance_cents: 6_000,
    status: "partial" as const,
    memo: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    revoked_at: null,
  };
}

function payment() {
  return {
    id: "payment-1",
    operating_company_id: COMPANY_ID,
    customer_id: "customer-1",
    customer_name: "Customer One",
    display_id: "PAY-100",
    payment_method: "ach" as const,
    payment_date: "2026-07-01",
    reference: "REF-100",
    amount_cents: 10_000,
    amount_applied_cents: 0,
    amount_unapplied_cents: 10_000,
    deposited_to_account_id: "bank-1",
    notes: null,
    voided_at: null,
    void_reason: null,
    created_at: "2026-07-01T00:00:00Z",
    applications: [],
  };
}

async function clickScopedRefresh(message: RegExp) {
  const bannerText = await screen.findByText(message);
  const banner = bannerText.closest("div");
  expect(banner).not.toBeNull();
  await userEvent.click(within(banner!).getByRole("button", { name: "Refresh" }));
}

describe("Accounting Wave C query error behavior", () => {
  beforeEach(() => {
    vi.mocked(accountingApi.listBills).mockResolvedValue({ rows: [bill()] });
    vi.mocked(accountingApi.listPaymentsForBill).mockResolvedValue({ payments: [] });
    vi.mocked(accountingApi.getPayment).mockResolvedValue(payment());
    vi.mocked(accountingApi.listInvoices).mockResolvedValue({ invoices: [] });
    vi.mocked(accountingApi.listExpenseCategoryMappings).mockResolvedValue({ rows: [] });
    vi.mocked(accountingApi.listCoaAccountsForJe).mockResolvedValue({ accounts: [] });
    vi.mocked(accountingApi.getAccountingReconciliationWorkspace).mockResolvedValue({
      unreconciled_bank_transactions: [],
      candidate_ledger_entries: [],
      variance_resolved_entries: [],
      progress: { total_transactions: 0, matched_or_skipped_transactions: 0, percent: 0 },
    });
    vi.mocked(accountingApi.getCashForecast).mockResolvedValue({
      as_of_date: "2026-07-18",
      opening_balance_cents: 0,
      settings: {
        fuel_estimate_weekly_cents: 0,
        insurance_weekly_cents: 0,
        lease_weekly_cents: 0,
        payroll_weekly_cents: 0,
      },
      weeks: [],
    });
    vi.mocked(accountingApi.getCashForecastSettings).mockResolvedValue({
      settings: {
        fuel_estimate_weekly_cents: 0,
        insurance_weekly_cents: 0,
        lease_weekly_cents: 0,
        payroll_weekly_cents: 0,
      },
    });
    vi.mocked(mdataApi.listVendors).mockResolvedValue({ vendors: [], total: 0 });
    vi.mocked(bankingApi.getAllAccounts).mockResolvedValue({ accounts: [] });
    vi.mocked(bankingApi.getCoaAccounts).mockResolvedValue({ accounts: [] });
    vi.mocked(bankingApi.getPlaidBankAccounts).mockResolvedValue({ accounts: [] });
    vi.mocked(paymentMethodsApi.listPaymentMethods).mockResolvedValue([
      {
        id: "method-1",
        operating_company_id: COMPANY_ID,
        name: "ACH",
        gl_account_id: null,
        is_active: true,
        sort_order: 1,
        created_at: "2026-07-01T00:00:00Z",
        updated_at: "2026-07-01T00:00:00Z",
      },
    ]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the bill-payment failure and Refresh refetches only payments", async () => {
    vi.mocked(accountingApi.listPaymentsForBill).mockRejectedValue(QUERY_ERROR);
    renderSurface(createElement(BillsPage), "/accounting/bills");

    await userEvent.click(await screen.findByRole("button", { name: /Expand row/i }));
    expect(await screen.findByText(/Failed to load bill payments: planted query failure/)).toBeInTheDocument();
    expect(screen.queryByText("Loading payments…")).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed to load vendor filters/)).not.toBeInTheDocument();
    const billsCalls = vi.mocked(accountingApi.listBills).mock.calls.length;
    const vendorCalls = vi.mocked(mdataApi.listVendors).mock.calls.length;
    const paymentCalls = vi.mocked(accountingApi.listPaymentsForBill).mock.calls.length;

    await clickScopedRefresh(/Failed to load bill payments/);

    await waitFor(() => expect(accountingApi.listPaymentsForBill).toHaveBeenCalledTimes(paymentCalls + 1));
    expect(accountingApi.listBills).toHaveBeenCalledTimes(billsCalls);
    expect(mdataApi.listVendors).toHaveBeenCalledTimes(vendorCalls);
  });

  it("renders the vendor-filter failure and Refresh refetches only vendors", async () => {
    vi.mocked(mdataApi.listVendors).mockRejectedValue(QUERY_ERROR);
    renderSurface(createElement(BillsPage), "/accounting/bills");

    expect(await screen.findByText(/Failed to load vendor filters: planted query failure/)).toBeInTheDocument();
    expect(screen.queryByText(/Failed to load bill payments/)).not.toBeInTheDocument();
    const billsCalls = vi.mocked(accountingApi.listBills).mock.calls.length;
    const vendorCalls = vi.mocked(mdataApi.listVendors).mock.calls.length;

    await clickScopedRefresh(/Failed to load vendor filters/);

    await waitFor(() => expect(mdataApi.listVendors).toHaveBeenCalledTimes(vendorCalls + 1));
    expect(accountingApi.listBills).toHaveBeenCalledTimes(billsCalls);
    expect(accountingApi.listPaymentsForBill).not.toHaveBeenCalled();
  });

  it("renders the Pay Bill account failure and Refresh refetches only accounts", async () => {
    vi.mocked(bankingApi.getAllAccounts).mockRejectedValue(QUERY_ERROR);
    renderSurface(
      createElement(PayBillModal, {
        open: true,
        operatingCompanyId: COMPANY_ID,
        vendorName: "Vendor One",
        bill: bill(),
        onClose: vi.fn(),
        onSaved: vi.fn(),
      }),
    );

    expect(await screen.findByText(/Failed to load payment accounts: planted query failure/)).toBeInTheDocument();
    expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
    const accountCalls = vi.mocked(bankingApi.getAllAccounts).mock.calls.length;

    await clickScopedRefresh(/Failed to load payment accounts/);

    await waitFor(() => expect(bankingApi.getAllAccounts).toHaveBeenCalledTimes(accountCalls + 1));
  });

  it("renders the CC account failure and Refresh refetches only accounts", async () => {
    vi.mocked(bankingApi.getAllAccounts).mockRejectedValue(QUERY_ERROR);
    renderSurface(
      createElement(CCPaymentModal, {
        open: true,
        operatingCompanyId: COMPANY_ID,
        bill: bill(),
        onClose: vi.fn(),
        onSaved: vi.fn(),
      }),
    );

    expect(await screen.findByText(/Failed to load credit-card accounts: planted query failure/)).toBeInTheDocument();
    expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
    const accountCalls = vi.mocked(bankingApi.getAllAccounts).mock.calls.length;

    await clickScopedRefresh(/Failed to load credit-card accounts/);

    await waitFor(() => expect(bankingApi.getAllAccounts).toHaveBeenCalledTimes(accountCalls + 1));
  });

  it("renders the open-invoice failure and Refresh leaves payment detail untouched", async () => {
    vi.mocked(accountingApi.listInvoices).mockRejectedValue(QUERY_ERROR);
    renderSurface(
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/accounting/payments/:id",
          element: createElement(PaymentDetailPage),
        }),
      ),
      "/accounting/payments/payment-1",
    );

    expect(await screen.findByText(/Failed to load open invoices for payment application: planted query failure/)).toBeInTheDocument();
    expect(screen.queryByText("Loading payment...")).not.toBeInTheDocument();
    const detailCalls = vi.mocked(accountingApi.getPayment).mock.calls.length;
    const invoiceCalls = vi.mocked(accountingApi.listInvoices).mock.calls.length;

    await clickScopedRefresh(/Failed to load open invoices for payment application/);

    // ONE listInvoices call per refetch: the open-invoice query is a single
    // server-side has_balance=true fetch (it used to be a dual status=sent +
    // status=partial Promise.all, which is what the old "+ 2" pinned).
    await waitFor(() => expect(accountingApi.listInvoices).toHaveBeenCalledTimes(invoiceCalls + 1));
    expect(vi.mocked(accountingApi.listInvoices).mock.calls.at(-1)?.[1]).toMatchObject({ has_balance: true });
    expect(accountingApi.getPayment).toHaveBeenCalledTimes(detailCalls);
  });

  it("renders the payment-method account failure and Refresh leaves methods untouched", async () => {
    vi.mocked(bankingApi.getCoaAccounts).mockRejectedValue(QUERY_ERROR);
    renderSurface(createElement(PaymentMethodsCatalogPage));
    await userEvent.click(await screen.findByRole("button", { name: "+ Create" }));

    expect(await screen.findByText(/Failed to load GL accounts: planted query failure/)).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    expect(screen.queryByText("Failed to load. Try refreshing.")).not.toBeInTheDocument();
    const methodsCalls = vi.mocked(paymentMethodsApi.listPaymentMethods).mock.calls.length;
    const accountCalls = vi.mocked(bankingApi.getCoaAccounts).mock.calls.length;

    await clickScopedRefresh(/Failed to load GL accounts/);

    await waitFor(() => expect(bankingApi.getCoaAccounts).toHaveBeenCalledTimes(accountCalls + 1));
    expect(paymentMethodsApi.listPaymentMethods).toHaveBeenCalledTimes(methodsCalls);
  });

  it("renders the category-map account failure and Refresh leaves mappings untouched", async () => {
    vi.mocked(accountingApi.listCoaAccountsForJe).mockRejectedValue(QUERY_ERROR);
    renderSurface(createElement(ExpenseCategoryMapPage));
    await userEvent.click(await screen.findByRole("button", { name: "+ Create Mapping" }));

    expect(await screen.findByText(/Failed to load mapping accounts: planted query failure/)).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't load category mappings/)).not.toBeInTheDocument();
    const mapCalls = vi.mocked(accountingApi.listExpenseCategoryMappings).mock.calls.length;
    const accountCalls = vi.mocked(accountingApi.listCoaAccountsForJe).mock.calls.length;

    await clickScopedRefresh(/Failed to load mapping accounts/);

    await waitFor(() => expect(accountingApi.listCoaAccountsForJe).toHaveBeenCalledTimes(accountCalls + 1));
    expect(accountingApi.listExpenseCategoryMappings).toHaveBeenCalledTimes(mapCalls);
  });

  it("renders the reconciliation-account failure without workspace empty states", async () => {
    vi.mocked(bankingApi.getPlaidBankAccounts).mockRejectedValue(QUERY_ERROR);
    renderSurface(createElement(ReconciliationWorkspacePage));

    expect(await screen.findByText(/Failed to load reconciliation accounts: planted query failure/)).toBeInTheDocument();
    expect(screen.queryByText("Failed to load. Try refreshing.")).not.toBeInTheDocument();
    expect(screen.queryByText("No unreconciled transactions")).not.toBeInTheDocument();
    expect(screen.queryByText("No candidates for period")).not.toBeInTheDocument();
    const accountCalls = vi.mocked(bankingApi.getPlaidBankAccounts).mock.calls.length;

    await clickScopedRefresh(/Failed to load reconciliation accounts/);

    await waitFor(() => expect(bankingApi.getPlaidBankAccounts).toHaveBeenCalledTimes(accountCalls + 1));
    expect(accountingApi.getAccountingReconciliationWorkspace).not.toHaveBeenCalled();
  });

  it("renders the forecast-settings failure without editable zero-value success state", async () => {
    vi.mocked(accountingApi.getCashForecastSettings).mockRejectedValue(QUERY_ERROR);
    renderSurface(createElement(CashForecastPage));

    expect(await screen.findByText(/Failed to load forecast settings: planted query failure/)).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't load cash forecast/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Fuel weekly estimate" })).toBeDisabled();
    const forecastCalls = vi.mocked(accountingApi.getCashForecast).mock.calls.length;
    const settingsCalls = vi.mocked(accountingApi.getCashForecastSettings).mock.calls.length;

    await clickScopedRefresh(/Failed to load forecast settings/);

    await waitFor(() => expect(accountingApi.getCashForecastSettings).toHaveBeenCalledTimes(settingsCalls + 1));
    expect(accountingApi.getCashForecast).toHaveBeenCalledTimes(forecastCalls);
  });
});
