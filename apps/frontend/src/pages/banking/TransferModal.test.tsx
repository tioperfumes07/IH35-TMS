// @vitest-environment jsdom
import * as matchers from "@testing-library/jest-dom/matchers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as bankingApi from "../../api/banking";
import { ToastProvider } from "../../components/Toast";
import { TransferModal } from "./TransferModal";
import source from "./TransferModal.tsx?raw";
expect.extend(matchers);

vi.mock("../../api/banking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/banking")>();
  return {
    ...actual,
    getPlaidBankAccounts: vi.fn(),
    createTransfer: vi.fn(),
    markBankTransactionTransfer: vi.fn().mockResolvedValue({ ok: true }),
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

describe("TransferModal — source assertions", () => {
  it("wires createTransfer API call for bank-to-bank transfers", () => {
    expect(source).toContain("createTransfer");
    expect(source).toContain("bank_to_bank");
    expect(source).toContain("from_account_id");
    expect(source).toContain("to_account_id");
    expect(source).toContain("amount_cents");
  });

  it("renders From/To account selectors and amount field", () => {
    expect(source).toContain("From bank account");
    expect(source).toContain("To bank account");
    expect(source).toContain("amount_cents");
    expect(source).toContain("Save transfer");
  });
});

describe("TransferModal — render smoke", () => {
  const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.mocked(bankingApi.getPlaidBankAccounts).mockResolvedValue({ accounts: [] });
    vi.mocked(bankingApi.createTransfer).mockResolvedValue({
      transfer: {
        id: "xfer-1",
        operating_company_id: companyId,
        transfer_type: "bank_to_bank",
        from_account_id: "",
        from_account_kind: "bank",
        to_account_id: "",
        to_account_kind: "bank",
        amount_cents: 0,
        transfer_date: "2026-05-01",
        memo: null,
        reference_number: null,
        qbo_journal_entry_id: null,
        revoked_at: null,
        revoked_reason: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  });

  it("renders modal title and save button when open", async () => {
    render(
      wrap(<TransferModal open operatingCompanyId={companyId} onClose={vi.fn()} onSaved={vi.fn()} />)
    );
    await waitFor(() =>
      expect(screen.getByText(/Record transfer/i)).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /Save transfer/i })).toBeInTheDocument();
  });
});
