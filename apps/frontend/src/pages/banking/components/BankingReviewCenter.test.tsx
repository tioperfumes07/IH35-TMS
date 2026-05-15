import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as banking from "../../../api/banking";
import * as wave2 from "../../../api/banking-wave2";
import { BankingReviewCenter } from "./BankingReviewCenter";

vi.mock("../../../api/banking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/banking")>();
  return {
    ...actual,
    getCoaAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
    getBankingUncategorized: vi.fn().mockResolvedValue({ transactions: [] }),
    categorizeBankTransaction: vi.fn().mockResolvedValue({ ok: true }),
    skipBankTransaction: vi.fn().mockResolvedValue({ ok: true }),
  };
});

vi.mock("../../../api/banking-wave2", () => ({
  getBankingTransactionsReview: vi.fn().mockResolvedValue({ items: [], next_cursor: 0 }),
  postBankTransactionAccept: vi.fn().mockRejectedValue(new Error("no accept")),
  postBankTransactionMatch: vi.fn(),
  postBankTransactionsBatchAccept: vi.fn(),
  postBankingRulesFromTransaction: vi.fn(),
}));

vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("BankingReviewCenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads review feed (happy path)", async () => {
    render(
      wrap(
        <BankingReviewCenter
          companyId="00000000-0000-4000-8000-000000000001"
          categorizedSection={<div>Categorized placeholder</div>}
        />
      )
    );
    expect(vi.mocked(wave2.getBankingTransactionsReview)).toHaveBeenCalled();
    expect(await screen.findByText("For review")).toBeInTheDocument();
  });

  it("falls back to uncategorized when review returns 404", async () => {
    const { ApiError } = await import("../../../api/client");
    vi.mocked(wave2.getBankingTransactionsReview).mockRejectedValueOnce(new ApiError(404, {}));
    render(
      wrap(
        <BankingReviewCenter
          companyId="00000000-0000-4000-8000-000000000001"
          categorizedSection={<div>Categorized placeholder</div>}
        />
      )
    );
    expect(await screen.findByText(/Review API unavailable/)).toBeInTheDocument();
    expect(vi.mocked(banking.getBankingUncategorized)).toHaveBeenCalled();
  });
});
