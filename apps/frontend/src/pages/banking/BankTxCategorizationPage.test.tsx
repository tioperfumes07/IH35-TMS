import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as bankingApi from "../../api/banking";
import { ApiError } from "../../api/client";
import { ToastProvider } from "../../components/Toast";
import { BankTxCategorizationPage } from "./BankTxCategorizationPage";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../api/banking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/banking")>();
  return {
    ...actual,
    getBankingKpis: vi.fn().mockResolvedValue({ total_uncategorized: 2 }),
    getBankingUncategorized: vi.fn(),
    getPlaidBankAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
    getCoaAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
    getBankingSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
  };
});

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("BankTxCategorizationPage", () => {
  beforeEach(() => {
    vi.mocked(bankingApi.getBankingUncategorized).mockResolvedValue({
      transactions: [{ id: "tx-1", transaction_date: "2026-05-01", description: "Coffee", amount_cents: -500 }],
    });
  });

  it("renders table row when uncategorized loads", async () => {
    render(wrap(<BankTxCategorizationPage />));
    await waitFor(() => expect(screen.getByText("Coffee")).toBeInTheDocument());
  });

  it("shows P6-T11204 banner when uncategorized returns 404", async () => {
    vi.mocked(bankingApi.getBankingUncategorized).mockRejectedValue(new ApiError(404, {}));
    render(wrap(<BankTxCategorizationPage />));
    await waitFor(() => expect(screen.getByText(/P6-T11204/i)).toBeInTheDocument());
  });

  it("bulk select enables batch bar", async () => {
    const user = userEvent.setup();
    render(wrap(<BankTxCategorizationPage />));
    await waitFor(() => expect(screen.getByText("Coffee")).toBeInTheDocument());
    const cb = screen.getByRole("checkbox");
    await user.click(cb);
    expect(await screen.findByText(/1 selected/i)).toBeInTheDocument();
  });
});
