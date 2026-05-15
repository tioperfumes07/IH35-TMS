import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as bankingWave2 from "../../../api/banking-wave2";
import * as banking from "../../../api/banking";
import { ToastProvider } from "../../../components/Toast";
import { CategorizeTransactionModal } from "./CategorizeTransactionModal";

vi.mock("../../../api/banking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/banking")>();
  return {
    ...actual,
    getPlaidBankAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
  };
});

vi.mock("../../../api/banking-wave2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/banking-wave2")>();
  return {
    ...actual,
    postBankTransactionCategorizeExtended: vi.fn().mockResolvedValue({ ok: true }),
    postBankTransactionAccept: vi.fn().mockResolvedValue({ ok: true }),
    getBankTransactionMatchCandidates: vi.fn().mockResolvedValue({ candidates: [] }),
    getAuditFeed: vi.fn().mockResolvedValue({ items: [] }),
    uploadDocumentSimple: vi.fn(),
    postBankTransactionAttachment: vi.fn(),
    postBankTransactionExclude: vi.fn(),
    postBankingRulesFromTransaction: vi.fn(),
    postBankTransferWave2: vi.fn(),
    postCreditCardPaymentWave2: vi.fn(),
    postBankTransactionMatch: vi.fn(),
  };
});

vi.mock("../../../components/forms/QboCombobox", () => ({
  QboCombobox: ({
    placeholder,
    "aria-label": ariaLabel,
    onChange,
  }: {
    placeholder?: string;
    "aria-label"?: string;
    onChange: (id: string | null, label: string) => void;
  }) => (
    <input
      aria-label={ariaLabel ?? placeholder ?? "combobox"}
      placeholder={placeholder}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v) onChange("acc-mock", v);
      }}
    />
  ),
}));

vi.mock("../../../components/maintenance/LocationMapModal", () => ({
  LocationMapModal: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Location map" /> : null),
}));

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("CategorizeTransactionModal", () => {
  const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
  const txId = "tx-mock-1";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(banking.getPlaidBankAccounts).mockResolvedValue({ accounts: [] });
  });

  it("opens in categorize mode by default", async () => {
    render(
      wrap(
        <CategorizeTransactionModal
          operatingCompanyId={companyId}
          transactionIds={[txId]}
          open
          onClose={vi.fn()}
          onSaved={vi.fn()}
          transactionPreview={{ id: txId, transaction_date: "2026-05-01", description: "Test", amount_cents: -100 }}
        />
      )
    );
    expect(screen.getByRole("dialog", { name: "Categorize transaction" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Categorize" })).toBeChecked();
  });

  it("blocks save until Account is set", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      wrap(
        <CategorizeTransactionModal
          operatingCompanyId={companyId}
          transactionIds={[txId]}
          open
          onClose={vi.fn()}
          onSaved={onSaved}
          transactionPreview={{ id: txId, transaction_date: "2026-05-01", amount_cents: -100 }}
        />
      )
    );
    await user.click(screen.getByRole("button", { name: "Save and close" }));
    expect(vi.mocked(bankingWave2.postBankTransactionCategorizeExtended)).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("mode switch updates body (match shows candidates)", async () => {
    const user = userEvent.setup();
    vi.mocked(bankingWave2.getBankTransactionMatchCandidates).mockResolvedValue({
      candidates: [
        { vendor_name: "Acme", amount_cents: -500, date: "2026-04-01", kind: "invoice", target_id: "inv-1" },
      ],
    });
    render(
      wrap(
        <CategorizeTransactionModal
          operatingCompanyId={companyId}
          transactionIds={[txId]}
          open
          onClose={vi.fn()}
          onSaved={vi.fn()}
          transactionPreview={{ id: txId, transaction_date: "2026-05-01", amount_cents: -100 }}
        />
      )
    );
    await user.click(screen.getByRole("radio", { name: "Match" }));
    expect(await screen.findByText("Acme")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Match" })).toBeChecked();
  });

  it("save and close closes modal after categorize succeeds", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      wrap(
        <CategorizeTransactionModal
          operatingCompanyId={companyId}
          transactionIds={[txId]}
          open
          onClose={onClose}
          onSaved={vi.fn()}
          transactionPreview={{ id: txId, transaction_date: "2026-05-01", bank_account_id: "bank-1", amount_cents: -100 }}
        />
      )
    );
    const boxes = screen.getAllByPlaceholderText(/Required account/i);
    await user.type(boxes[0], "Rent");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Save and close" }));
    await waitFor(() => expect(vi.mocked(bankingWave2.postBankTransactionCategorizeExtended)).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
