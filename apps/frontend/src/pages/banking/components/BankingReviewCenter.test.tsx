import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  postBankTransactionExclude: vi.fn().mockResolvedValue({ ok: true }),
  postBankTransactionCategorizeExtended: vi.fn().mockResolvedValue({ ok: true }),
  getBankTransactionMatchCandidates: vi.fn().mockResolvedValue({ candidates: [] }),
}));

vi.mock("../../../components/Toast", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock("../../../components/forms/QboCombobox", () => ({
  QboCombobox: ({ placeholder, "aria-label": ariaLabel }: { placeholder?: string; "aria-label"?: string }) => (
    <input aria-label={ariaLabel ?? placeholder ?? "combobox"} placeholder={placeholder} />
  ),
}));

vi.mock("../../../components/maintenance/LocationMapModal", () => ({
  LocationMapModal: () => null,
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

  it("Edit opens categorize modal", async () => {
    const user = userEvent.setup();
    vi.mocked(wave2.getBankingTransactionsReview).mockResolvedValue({
      items: [
        {
          id: "rev-1",
          transaction_date: "2026-05-01",
          description: "Test row",
          amount_cents: -100,
        },
      ],
      next_cursor: 0,
    });
    render(
      wrap(
        <BankingReviewCenter
          companyId="00000000-0000-4000-8000-000000000001"
          categorizedSection={<div>Categorized placeholder</div>}
        />
      )
    );
    await user.click(await screen.findByRole("button", { name: "Edit in categorize modal" }));
    expect(await screen.findByRole("dialog", { name: "Categorize transaction" })).toBeInTheDocument();
  });
});
