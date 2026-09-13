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
 * ROUND-20.8 B11 — /banking read "QBO Sync: Not connected | Last sync: n/a" while /accounting's
 * AccountingHubPage read "QBO SYNC 0 pending -- queue healthy" at the same moment. Both facts were
 * individually true (OAuth connection state vs. sync-queue backlog) but each screen showed only
 * one, so a reader saw what looked like one ledger giving two contradictory answers. Fixed by
 * routing this tile through the same describeQboSyncStatus() derivation Banking's SyncStatusStrip
 * already calls, fed the connection-status query this page was previously missing.
 */
vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../../api/accounting", () => ({
  listBills: vi.fn().mockResolvedValue({ rows: [] }),
  listBillPayments: vi.fn().mockResolvedValue({ rows: [] }),
  listInvoices: vi.fn().mockResolvedValue({ invoices: [] }),
  listPayments: vi.fn().mockResolvedValue({ rows: [] }),
}));

vi.mock("../../../api/banking", () => ({
  getQboSyncQueue: vi.fn().mockResolvedValue({ items: [] }),
  getQboSyncQueueStats: vi.fn().mockResolvedValue({ pending: 0, failed: 0 }),
}));

vi.mock("../../../api/forensic", () => ({
  getQboConnectionStatus: vi.fn(),
}));

vi.mock("../../../api/driverFinance", () => ({
  listSettlements: vi.fn().mockResolvedValue({ settlements: [] }),
}));

vi.mock("../../../api/reports", () => ({
  getTrialBalanceReport: vi.fn().mockRejectedValue(new Error("not ready")),
  getProfitLossReport: vi.fn().mockRejectedValue(new Error("not ready")),
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
    // The exact contradiction this bug produced — must never render once connection is wired in.
    expect(screen.queryByText("queue healthy")).not.toBeInTheDocument();
  });

  it("reads 'Healthy' when connected with an empty queue", async () => {
    vi.mocked(bankingApi.getQboSyncQueueStats).mockResolvedValue({ pending: 0, failed: 0 } as never);
    vi.mocked(forensicApi.getQboConnectionStatus).mockResolvedValue({ connected: true } as never);

    render(wrap(<AccountingHubPage />));

    await waitFor(() => expect(forensicApi.getQboConnectionStatus).toHaveBeenCalled());
    expect(await screen.findByText("Healthy")).toBeInTheDocument();
  });

  it("still surfaces pending/failed counts when connected (queue backlog unchanged)", async () => {
    vi.mocked(bankingApi.getQboSyncQueueStats).mockResolvedValue({ pending: 3, failed: 1 } as never);
    vi.mocked(forensicApi.getQboConnectionStatus).mockResolvedValue({ connected: true } as never);

    render(wrap(<AccountingHubPage />));

    await waitFor(() => expect(forensicApi.getQboConnectionStatus).toHaveBeenCalled());
    expect(await screen.findByText("1 failed")).toBeInTheDocument();
  });
});
