import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as bankingApi from "../../../api/banking";
import * as wave2 from "../../../api/banking-wave2";
import { ApiError } from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { BankingTransactionsPage } from "../BankingTransactionsPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../../api/banking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/banking")>();
  return {
    ...actual,
    getBankingTiles: vi.fn(),
    getPlaidBankAccounts: vi.fn(),
    getAllAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
  };
});

vi.mock("../../../api/banking-wave2", async (importOriginal) => {
  const review = await importOriginal<typeof import("../../../api/banking-wave2")>();
  return {
    ...review,
    getBankingTransactionsList: vi.fn(),
    getBankingTransactionsReview: vi.fn(),
    getBankTransactionMatchCandidates: vi.fn().mockResolvedValue({ candidates: [] }),
    postBankTransactionMatch: vi.fn(),
    postBankTransactionAccept: vi.fn(),
    postBankTransactionExclude: vi.fn(),
  };
});

function wrap(ui: ReactElement, { route = "/banking/transactions" }: { route?: string } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const tileA = {
  id: "acc-a",
  operating_company_id: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
  display_name: "BOA-CHECKING-1135",
  account_type: "Bank",
  tag: "Bank",
  tile_kind: "real" as const,
  current_balance: 2400.55,
  uncategorized_count: 3,
  color_tag: "",
  is_relay: false,
  display_order: 1,
  last_txn_date: "2026-05-01",
};

const tileB = {
  ...tileA,
  id: "acc-b",
  display_name: "BOA-SAVINGS-1148",
  current_balance: -100,
  display_order: 2,
};

describe("BankingTransactionsPage", () => {
  beforeEach(() => {
    vi.mocked(bankingApi.getBankingTiles).mockResolvedValue({ tiles: [tileA, tileB] });
    vi.mocked(bankingApi.getPlaidBankAccounts).mockResolvedValue({ accounts: [] });
    vi.mocked(wave2.getBankingTransactionsReview).mockResolvedValue({ items: [], next_cursor: 0 });
    vi.mocked(wave2.getBankingTransactionsList).mockResolvedValue({
      items: [
        {
          id: "tx-1",
          transaction_date: "2026-04-15",
          description: "WIRE PAYMENT",
          amount_cents: -5000,
          review_state: "for_review",
          suggestions: [{}, {}, {}],
        },
        {
          id: "tx-2",
          transaction_date: "2026-04-10",
          description: "COFFEE",
          amount_cents: -350,
          review_state: "for_review",
        },
        {
          id: "tx-3",
          transaction_date: "2026-03-01",
          description: "OLD",
          amount_cents: 100,
          review_state: "categorized",
          coa_account_name: "Misc",
        },
      ],
      next_cursor: 0,
    });
  });

  it("renders account tile strip with N tiles", async () => {
    render(wrap(<BankingTransactionsPage />));
    await waitFor(() => expect(screen.getByRole("button", { name: /BOA-CHECKING-1135/i })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /BOA-SAVINGS-1148/i })).toBeInTheDocument();
  });

  it("clicking a tile changes selected state and filters grid", async () => {
    const user = userEvent.setup();
    const listSpy = vi.mocked(wave2.getBankingTransactionsList);
    render(wrap(<BankingTransactionsPage />));
    await waitFor(() => expect(screen.getByRole("button", { name: /BOA-CHECKING-1135/i })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /BOA-SAVINGS-1148/i }));
    await waitFor(() => {
      const last = listSpy.mock.calls[listSpy.mock.calls.length - 1];
      expect(last?.[1]).toMatchObject({ account_id: "acc-b" });
    });
  });

  it("renders three tabs with For review count", async () => {
    vi.mocked(wave2.getBankingTransactionsReview).mockImplementation(async () => ({ items: [{ id: "x" }], next_cursor: 0 }));
    render(wrap(<BankingTransactionsPage />));
    await waitFor(() => expect(screen.getByRole("button", { name: "For review tab" })).toHaveTextContent("For review (1)"));
    expect(screen.getByRole("button", { name: "Categorized tab" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluded tab" })).toBeInTheDocument();
  });

  it("tab switch refetches with categorized review state", async () => {
    const user = userEvent.setup();
    const spy = vi.mocked(wave2.getBankingTransactionsList);
    render(wrap(<BankingTransactionsPage />));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    spy.mockClear();
    await user.click(screen.getByRole("button", { name: "Categorized tab" }));
    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(
        "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071",
        expect.objectContaining({ review_state: "categorized" })
      );
    });
  });

  it("row with suggested matches shows matches found pill", async () => {
    render(wrap(<BankingTransactionsPage />));
    await waitFor(() => expect(screen.getByText(/3 matches found/i)).toBeInTheDocument());
  });

  it("Add click opens inline edit panel", async () => {
    const user = userEvent.setup();
    render(wrap(<BankingTransactionsPage />));
    const addBtn = await screen.findByRole("button", { name: /Add categorization for tx-2/i });
    await user.click(addBtn);
    expect(await screen.findByText("Quick add")).toBeInTheDocument();
  });

  it("Match click opens drawer", async () => {
    const user = userEvent.setup();
    vi.mocked(wave2.getBankTransactionMatchCandidates).mockResolvedValue({
      candidates: [{ kind: "invoice", target_id: "inv-1", vendor_name: "Acme", amount_cents: -5000, date: "2026-04-01" }],
    });
    render(wrap(<BankingTransactionsPage />));
    const matchBtn = await screen.findByRole("button", { name: /Match transaction tx-1/i });
    await user.click(matchBtn);
    expect(await screen.findByRole("dialog", { name: /Match transaction/i })).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });

  it("pagination buttons move between pages when many rows", async () => {
    const many = Array.from({ length: 55 }).map((_, i) => ({
      id: `tx-${i}`,
      transaction_date: "2026-04-01",
      description: `Row ${i}`,
      amount_cents: -100,
      review_state: "for_review",
    }));
    vi.mocked(wave2.getBankingTransactionsList).mockResolvedValue({ items: many, next_cursor: 0 });
    const user = userEvent.setup();
    render(wrap(<BankingTransactionsPage />));
    await waitFor(() => expect(screen.getByText("Row 0")).toBeInTheDocument());
    expect(screen.queryByText("Row 52")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Next page/i }));
    await waitFor(() => expect(screen.getByText("Row 52")).toBeInTheDocument());
  });

  it("empty state when no transactions", async () => {
    vi.mocked(wave2.getBankingTransactionsList).mockResolvedValue({ items: [], next_cursor: 0 });
    render(wrap(<BankingTransactionsPage />));
    expect(await screen.findByText(/No transactions for this view/i)).toBeInTheDocument();
  });

  it("shows error banner when transactions list fails", async () => {
    vi.mocked(wave2.getBankingTransactionsList).mockRejectedValue(new ApiError(500, {}));
    render(wrap(<BankingTransactionsPage />));
    expect(await screen.findByText(/Failed to load/i)).toBeInTheDocument();
  });
});
