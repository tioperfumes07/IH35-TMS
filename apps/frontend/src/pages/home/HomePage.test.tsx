import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import * as homeApi from "../../api/home";
import * as reportsApi from "../../api/reports";
import * as cashApi from "../../api/cashAdvanceRequests";
import { HomePage } from "./HomePage";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "00000000-0000-0000-0000-000000000099",
    companies: [],
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: vi.fn(),
    setDefaultCompanyForUser: vi.fn(() => Promise.resolve()),
  }),
}));

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("HomePage (T11.19)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(homeApi, "fetchHomeTodayRevenue").mockResolvedValue({
      revenue_cents: 5_000_000,
      delta_pct_vs_yesterday: 2.5,
    });
    vi.spyOn(homeApi, "fetchHomeOpenLoadsCount").mockResolvedValue({
      total: 12,
      in_transit: 3,
      assigned: 4,
      unassigned: 5,
    });
    vi.spyOn(homeApi, "fetchHomeDriversOnDuty").mockResolvedValue({
      active: 20,
      total_drivers: 30,
      on_break: 2,
    });
    vi.spyOn(homeApi, "fetchHomeWosOpenCount").mockResolvedValue({ open: 7, in_progress: 3 });
    vi.spyOn(homeApi, "fetchHomeCashPosition").mockResolvedValue({
      balance_cents: 10_000_000,
      last_reconciled_at: "2026-05-01T00:00:00Z",
    });
    vi.spyOn(homeApi, "fetchHomeFactoringBalance").mockResolvedValue({
      outstanding_cents: 2_500_000,
      invoices_factored: 4,
    });
    vi.spyOn(homeApi, "fetchHomeWeeklyRevenue").mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => ({
        date: `2026-05-${String(i + 1).padStart(2, "0")}`,
        revenue_cents: 1000 * (i + 1),
      }))
    );
    vi.spyOn(homeApi, "fetchHomeWoStatusCounts").mockResolvedValue([
      { status: "draft", count: 1 },
      { status: "open", count: 2 },
      { status: "in_progress", count: 3 },
      { status: "completed", count: 4 },
      { status: "cancelled", count: 1 },
    ]);
    vi.spyOn(homeApi, "fetchHomeFleetUtilization").mockResolvedValue({
      active_units: 8,
      total_units: 10,
      percentage: 80,
    });
    vi.spyOn(homeApi, "fetchHomeAttentionList").mockResolvedValue({ items: [] });
    vi.spyOn(homeApi, "fetchHomeFleetSnapshot").mockResolvedValue({
      trucks: 1,
      flatbeds: 0,
      dry_vans: 0,
      refrigerated: 0,
      trailers: 0,
      in_shop: 0,
      out_of_service: 0,
      assigned_units: 0,
      idle_units: 0,
      samsara_live: 0,
      no_signal_6h: 0,
      roadside: 0,
    });
    vi.spyOn(reportsApi, "getKpiSummary").mockResolvedValue({
      available_reports: 0,
      scheduled: 0,
      run_last_7d: 0,
      outstanding_ar_cents: 0,
      tracked_assets: 1,
      assigned_working: 0,
      maint_past_due: 0,
      open_damage: 0,
      pending_qbo_sync: 0,
      ifta_status: { quarter: "Q1", dueAt: "TBD", daysUntilDue: 0 },
    });
    vi.spyOn(cashApi.cashAdvanceRequestsOfficeApi, "listPendingOwnerApproval").mockResolvedValue({ requests: [] });
  });

  it("renders 6 KPI labels, chart headings, attention section, and four quick actions", async () => {
    render(
      wrap(<HomePage auth={{ uuid: "u1", email: "t@test.com", role: "Dispatcher" }} />)
    );

    expect(screen.getByRole("button", { name: "Print this page" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Today's Revenue")).toBeInTheDocument());
    expect(screen.getByText("Open Loads")).toBeInTheDocument();
    expect(screen.getByText("Drivers On Duty")).toBeInTheDocument();
    expect(screen.getByText("WOs Open")).toBeInTheDocument();
    expect(screen.getByText("Cash Position")).toBeInTheDocument();
    expect(screen.getByText("Factoring Balance")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Weekly revenue")).toBeInTheDocument());
    expect(screen.getByText("Work orders by status")).toBeInTheDocument();
    expect(screen.getByText("Fleet utilization")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /\+ Book Load/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+ Create WO/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+ Create Invoice/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+ Record Expense/i })).toBeInTheDocument();

    expect(screen.getByText("Attention")).toBeInTheDocument();
    expect(screen.getByText("Operations snapshot (reports KPIs)")).toBeInTheDocument();
  });
});
