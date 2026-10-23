import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountingHubPage } from "./AccountingHubPage";
import * as accountingApi from "../../api/accounting";
import * as reportsApi from "../../api/reports";
import { ToastProvider } from "../../components/Toast";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "Owner" } }),
}));

vi.mock("../../api/accounting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/accounting")>();
  return {
    ...actual,
    listBills: vi.fn().mockResolvedValue({ rows: [] }),
    listExpenses: vi.fn().mockResolvedValue({ rows: [] }),
    listInvoices: vi.fn().mockResolvedValue({ invoices: [] }),
    getMonthCloseStatus: vi.fn().mockResolvedValue({
      period: "2026-01",
      period_start: "2026-01-01",
      period_end: "2026-01-31",
      period_id: null,
      period_status: "open",
      bank_recon: { complete: false, accounts_pending: [] },
      ar_aging_review: { complete: false, overdue_count: 0, reviewed: false },
      ap_aging_review: { complete: false, overdue_count: 0, reviewed: false },
      fuel_tax: { complete: true, ifta_filed: false, quarter_label: "Q1", due_this_month: false },
      adjusting_entries: { count: 0 },
      can_lock: false,
    }),
  };
});

vi.mock("../../api/banking", () => ({
  getQboSyncQueue: vi.fn().mockResolvedValue({ items: [] }),
  getQboSyncQueueStats: vi.fn().mockResolvedValue({ pending: 0, failed: 0 }),
}));

vi.mock("../../api/forensic", () => ({
  getQboConnectionStatus: vi.fn().mockResolvedValue({ connected: true }),
}));

vi.mock("../../api/my-accountant", () => ({
  getAccountingPeriods: vi.fn().mockResolvedValue({ periods: [] }),
}));

vi.mock("../../api/cashFlow", () => ({
  getActualVsProjected: vi.fn().mockResolvedValue({
    from: "2026-10-01",
    to: "2026-10-23",
    lines: [],
    bank_categorization_coverage: { categorized_count: 1, total_count: 1 },
    accuracy_summary: {
      total_projected_income_cents: 0,
      total_actual_income_cents: 10000,
      income_variance_pct: null,
      total_projected_expense_cents: 0,
      total_actual_expense_cents: 4000,
      expense_variance_pct: null,
    },
  }),
  getRollingLedger: vi.fn().mockResolvedValue({
    from: "2026-08-01",
    to: "2026-10-23",
    opening_cash_cents: null,
    rows: [],
    days: [{ date: "2026-10-20", income_due_cents: 0, expenses_due_cents: 0, income_carry_over_cents: 0, expenses_carry_over_cents: 0, net_cents: 100, running_cash_cents: null }],
  }),
}));

vi.mock("../../api/tourReadout", () => ({
  listTours: vi.fn().mockResolvedValue({
    state: "open",
    count: 1,
    voided_count: 0,
    rows: [
      {
        tour_id: "t1",
        driver_id: "d1",
        driver_name: "Test Driver",
        driver_net_cents: 1478,
      },
    ],
  }),
}));

vi.mock("../../api/reports", () => ({
  getArAgingReport: vi.fn().mockResolvedValue({
    status: "real",
    generated_at: new Date().toISOString(),
    as_of_date: "2026-10-23",
    total_open_cents: 10000,
    total_open_invoices: 2,
    rows: [
      {
        customer_id: "c1",
        customer_name: "Acme",
        open_invoice_count: 2,
        current_cents: 6000,
        bucket_1_30_cents: 4000,
        bucket_31_60_cents: 0,
        bucket_61_90_cents: 0,
        bucket_91_plus_cents: 0,
        total_open_cents: 10000,
        uncleared_documents: [],
        uncleared_cents: 0,
        cleared_open_cents: 10000,
      },
    ],
  }),
}));

function wrap(ui: ReactElement) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("AccountingHubPage — board 443.267", () => {
  afterEach(cleanup);

  it("renders board sections Receivables aging · Cash pulse · Settlements open", async () => {
    render(wrap(<AccountingHubPage />));

    await waitFor(() => expect(reportsApi.getArAgingReport).toHaveBeenCalled());
    expect(await screen.findByTestId("accounting-hub-receivables-aging")).toBeInTheDocument();
    expect(screen.getByTestId("accounting-hub-cash-pulse")).toBeInTheDocument();
    expect(screen.getByTestId("accounting-hub-settlements-open")).toBeInTheDocument();
    expect(screen.getByTestId("accounting-hub-close-calendar")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open trial balance/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open profit & loss/i })).not.toBeInTheDocument();
    expect(accountingApi.listBills).toHaveBeenCalled();
  });

  it("wires open settlements from listTours", async () => {
    render(wrap(<AccountingHubPage />));
    expect(await screen.findByText("Test Driver")).toBeInTheDocument();
    expect(screen.getByText(/Receivables aging/i)).toBeInTheDocument();
  });
});
