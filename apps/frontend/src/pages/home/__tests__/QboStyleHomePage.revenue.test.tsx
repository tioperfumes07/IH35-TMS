/**
 * 0280-02 — QboStyleHomePage must distinguish transport/5xx from typed schema unverifiable.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../api/client";
import * as homeApi from "../../../api/home";
import * as accountingHomeApi from "../../../api/accountingHome";
import * as bankingApi from "../../../api/banking";
import { ToastProvider } from "../../../components/Toast";
import { formatTodayRevenueDisplay, QboStyleHomePage } from "../QboStyleHomePage";

vi.mock("../../../contexts/CompanyContext", () => ({
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
      <MemoryRouter>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const auth = { uuid: "u1", email: "owner@ih35.test", role: "Owner" } as never;

describe("formatTodayRevenueDisplay", () => {
  it("labels typed unverifiable, not transport errors", () => {
    expect(
      formatTodayRevenueDisplay({
        isLoading: false,
        isError: false,
        status: "unverifiable",
        revenueCents: null,
      }).kind
    ).toBe("unverifiable");
    expect(
      formatTodayRevenueDisplay({
        isLoading: false,
        isError: true,
        status: undefined,
        revenueCents: null,
      })
    ).toEqual({ kind: "error", text: "Unable to load revenue" });
  });
});

describe("QboStyleHomePage revenue states (0280-02)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(bankingApi, "getBankingTiles").mockResolvedValue({ tiles: [] } as never);
    vi.spyOn(homeApi, "fetchHomeCashPosition").mockResolvedValue({
      balance_cents: 0,
      last_reconciled_at: null,
    });
    vi.spyOn(accountingHomeApi, "fetchAccountingRoleHome").mockResolvedValue({
      ar_aging: {
        total_outstanding_cents: 0,
        current_cents: 0,
        d31_60_cents: 0,
        d61_90_cents: 0,
        d90_plus_cents: 0,
      },
      ap_aging: { total_outstanding_cents: 0 },
      qbo: { outbox_depth: 0, failed_outbox_count: 0 },
    } as never);
  });

  it("typed 200 unverifiable → shows Unverifiable (not retry error)", async () => {
    vi.spyOn(homeApi, "fetchHomeTodayRevenue").mockResolvedValue({
      revenue_cents: null,
      status: "unverifiable",
      unverifiable_reason: "missing_table:accounting.transaction_source_links",
    });
    render(wrap(<QboStyleHomePage auth={auth} />));
    await waitFor(() => expect(screen.getByTestId("qbo-revenue-unverifiable")).toBeInTheDocument());
    expect(screen.getByText("Unverifiable")).toBeInTheDocument();
    expect(screen.queryByTestId("qbo-revenue-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("qbo-revenue-retry")).not.toBeInTheDocument();
  });

  it("real 500/transport failure → error + retry, never Unverifiable", async () => {
    vi.spyOn(homeApi, "fetchHomeTodayRevenue").mockRejectedValue(
      new ApiError(500, { error: "revenue_gl_linkage_failed", message: "connection_reset" })
    );
    render(wrap(<QboStyleHomePage auth={auth} />));
    await waitFor(() => expect(screen.getByTestId("qbo-revenue-error")).toBeInTheDocument());
    expect(screen.getByTestId("qbo-revenue-retry")).toBeInTheDocument();
    expect(screen.queryByText("Unverifiable")).not.toBeInTheDocument();
    expect(screen.getByText(/not a schema linkage gap/i)).toBeInTheDocument();
  });
});

// GO-0027-HOME-F: Bank accounts / Expenses / Invoices cards must never render a fabricated $0 on
// a failed fetch -- matching the Profit & Loss card's own error+retry handling right next to them.
describe("QboStyleHomePage bank/expenses/invoices error states (GO-0027-HOME-F)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(homeApi, "fetchHomeTodayRevenue").mockResolvedValue({
      revenue_cents: 0,
      status: "ok",
    } as never);
  });

  it("bank-tiles fetch fails → error + retry, never $0 total balance", async () => {
    vi.spyOn(bankingApi, "getBankingTiles").mockRejectedValue(new ApiError(500, { error: "internal" }));
    vi.spyOn(homeApi, "fetchHomeCashPosition").mockResolvedValue({ balance_cents: 0, last_reconciled_at: null });
    vi.spyOn(accountingHomeApi, "fetchAccountingRoleHome").mockResolvedValue({
      ar_aging: { total_outstanding_cents: 0, current_cents: 0, d31_60_cents: 0, d61_90_cents: 0, d90_plus_cents: 0 },
      ap_aging: { total_outstanding_cents: 0 },
      qbo: { outbox_depth: 0, failed_outbox_count: 0 },
    } as never);
    render(wrap(<QboStyleHomePage auth={auth} />));
    await waitFor(() => expect(screen.getByTestId("qbo-bank-tiles-error")).toBeInTheDocument());
    expect(screen.getByTestId("qbo-bank-tiles-retry")).toBeInTheDocument();
    expect(screen.queryByText("Total bank balance")).not.toBeInTheDocument();
  });

  it("accounting-role-home fetch fails → expenses AND invoices cards both show error + retry, never $0", async () => {
    vi.spyOn(bankingApi, "getBankingTiles").mockResolvedValue({ tiles: [] } as never);
    vi.spyOn(homeApi, "fetchHomeCashPosition").mockResolvedValue({ balance_cents: 0, last_reconciled_at: null });
    vi.spyOn(accountingHomeApi, "fetchAccountingRoleHome").mockRejectedValue(new ApiError(500, { error: "internal" }));
    render(wrap(<QboStyleHomePage auth={auth} />));
    await waitFor(() => expect(screen.getByTestId("qbo-expenses-error")).toBeInTheDocument());
    expect(screen.getByTestId("qbo-expenses-retry")).toBeInTheDocument();
    expect(screen.getByTestId("qbo-invoices-error")).toBeInTheDocument();
    expect(screen.getByTestId("qbo-invoices-retry")).toBeInTheDocument();
    expect(screen.queryByText("Outstanding A/P")).not.toBeInTheDocument();
    expect(screen.queryByText("Unpaid (last 365 days)")).not.toBeInTheDocument();
  });
});
