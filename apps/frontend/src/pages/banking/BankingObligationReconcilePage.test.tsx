import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { BankingObligationReconcilePage } from "./BankingObligationReconcilePage";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "Owner" } }),
}));

vi.mock("../../api/banking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/banking")>();
  return {
    ...actual,
    getPlaidBankAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
    listUnmatchedReconcileTransactions: vi.fn().mockResolvedValue({
      transactions: [
        {
          id: "tx-1",
          amount_cents: 12000,
          transaction_date: "2026-05-27",
          description: "Fuel station",
          merchant_name: "Fuel station",
        },
      ],
    }),
    listReconcileObligations: vi.fn().mockResolvedValue({ obligations: [] }),
    getReconcileSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
    bulkReconcileAction: vi.fn().mockResolvedValue({ ok: true, updated_count: 1 }),
    reconcileBankTransaction: vi.fn().mockResolvedValue({ ok: true }),
  };
});

function wrap(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("BankingObligationReconcilePage", () => {
  it("navigates selected rows to multi-bill page", async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <MemoryRouter initialEntries={["/banking/reconcile"]}>
          <Routes>
            <Route path="/banking/reconcile" element={<BankingObligationReconcilePage />} />
            <Route path="/accounting/bills/multiple" element={<div>multi bill destination</div>} />
          </Routes>
        </MemoryRouter>
      )
    );

    await user.click(await screen.findByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /create bills \(1\)/i }));

    expect(await screen.findByText("multi bill destination")).toBeInTheDocument();
  });
});
