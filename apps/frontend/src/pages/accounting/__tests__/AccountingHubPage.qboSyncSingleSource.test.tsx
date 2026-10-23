import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AccountingHubPage } from "../AccountingHubPage";
import * as bankingApi from "../../../api/banking";
import * as forensicApi from "../../../api/forensic";
import { ToastProvider } from "../../../components/Toast";

/**
 * ROUND-20.8 B11 — QBO Sync tile must share describeQboSyncStatus with Banking.
 * ROUND 443.267 — hub still exposes the same KPI on the board strip.
 */
vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "Owner" } }),
}));

vi.mock("../../../api/accounting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/accounting")>();
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

vi.mock("../../../api/banking", () => ({
  getQboSyncQueue: vi.fn().mockResolvedValue({ items: [] }),
  getQboSyncQueueStats: vi.fn().mockResolvedValue({ pending: 0, failed: 0 }),
}));

vi.mock("../../../api/forensic", () => ({
  getQboConnectionStatus: vi.fn(),
}));

vi.mock("../../../api/my-accountant", () => ({
  getAccountingPeriods: vi.fn().mockResolvedValue({ periods: [] }),
}));

vi.mock("../../../api/cashFlow", () => ({
  getActualVsProjected: vi.fn().mockResolvedValue({
    from: "2026-10-01",
    to: "2026-10-23",
    lines: [],
    bank_categorization_coverage: { categorized_count: 1, total_count: 1 },
    accuracy_summary: {
      total_projected_income_cents: 0,
      total_actual_income_cents: 0,
      income_variance_pct: null,
      total_projected_expense_cents: 0,
      total_actual_expense_cents: 0,
      expense_variance_pct: null,
    },
  }),
  getRollingLedger: vi.fn().mockResolvedValue({
    from: "2026-08-01",
    to: "2026-10-23",
    opening_cash_cents: null,
    rows: [],
    days: [],
  }),
}));

vi.mock("../../../api/tourReadout", () => ({
  listTours: vi.fn().mockResolvedValue({ state: "open", count: 0, voided_count: 0, rows: [] }),
}));

vi.mock("../../../api/reports", () => ({
  getArAgingReport: vi.fn().mockResolvedValue({
    status: "real",
    generated_at: new Date().toISOString(),
    total_open_cents: 0,
    total_open_invoices: 0,
    rows: [],
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

describe("AccountingHubPage QBO Sync tile — single source of truth with Banking (ROUND-20.8 B11)", () => {
  it("reads 'Not connected' — never '0 pending / queue healthy' — when QBO is disconnected, even with an empty queue", async () => {
    vi.mocked(bankingApi.getQboSyncQueueStats).mockResolvedValue({ pending: 0, failed: 0 } as never);
    vi.mocked(forensicApi.getQboConnectionStatus).mockResolvedValue({ connected: false } as never);

    render(wrap(<AccountingHubPage />));

    await waitFor(() => expect(forensicApi.getQboConnectionStatus).toHaveBeenCalled());
    expect(await screen.findByText("Not connected")).toBeInTheDocument();
    expect(screen.queryByText("queue healthy")).not.toBeInTheDocument();
  });

  it("reads 'Healthy' when connected with an empty queue", async () => {
    vi.mocked(bankingApi.getQboSyncQueueStats).mockResolvedValue({ pending: 0, failed: 0 } as never);
    vi.mocked(forensicApi.getQboConnectionStatus).mockResolvedValue({ connected: true } as never);

    render(wrap(<AccountingHubPage />));

    await waitFor(() => expect(forensicApi.getQboConnectionStatus).toHaveBeenCalled());
    expect(await screen.findByText("Healthy")).toBeInTheDocument();
  });
});
