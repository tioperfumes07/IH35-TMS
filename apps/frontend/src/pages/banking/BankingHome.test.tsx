import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { BankingHomePage } from "./BankingHome";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "company-1" }),
}));

vi.mock("../../api/banking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/banking")>();
  return {
    ...actual,
    getBankingKpis: vi.fn().mockResolvedValue({
      total_cash: 0,
      dip_operating: 0,
      dip_payroll: 0,
      total_uncategorized: 1,
      factoring_reserve: 0,
      driver_escrow: 0,
    }),
    getBankingTiles: vi.fn().mockResolvedValue({ tiles: [] }),
    getAllAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
    getPlaidBankAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
    getReconciliationSessions: vi.fn().mockResolvedValue({ open_sessions: [], completed_sessions: [] }),
    startReconciliationSession: vi.fn(),
    getBankingUncategorized: vi.fn().mockResolvedValue({
      transactions: [
        {
          id: "tx-1",
          transaction_date: "2026-05-17T00:00:00.000Z",
          description: "Fuel station",
          amount_cents: 12345,
        },
      ],
    }),
  };
});

vi.mock("./components/BankingPlaidConnectionsPanel", () => ({
  BankingPlaidConnectionsPanel: () => <div data-testid="plaid-connections" />,
}));

function wrap(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("BankingHomePage categorize panel", () => {
  it("formats categorize transaction dates as MM/DD/YYYY", async () => {
    render(wrap(<BankingHomePage />));
    expect(await screen.findByText("05/17/2026")).toBeInTheDocument();
    expect(screen.queryByText("2026-05-17T00:00:00.000Z")).not.toBeInTheDocument();
  });
});
