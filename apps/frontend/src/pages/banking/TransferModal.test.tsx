import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as bankingApi from "../../api/banking";
import { ToastProvider } from "../../components/Toast";
import { TransferModal } from "./TransferModal";

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

describe("TransferModal", () => {
  const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
  const acctA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const acctB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  beforeEach(() => {
    vi.mocked(bankingApi.getPlaidBankAccounts).mockResolvedValue({
      accounts: [
        {
          id: acctA,
          operating_company_id: companyId,
          institution_name: "Test Bank",
          account_name: "Checking A",
          account_type: "depository",
          account_mask: "1111",
          current_balance_cents: 0,
          available_balance_cents: 0,
          currency_code: "USD",
          sync_status: "active",
          is_active: true,
          last_synced_at: null,
        },
        {
          id: acctB,
          operating_company_id: companyId,
          institution_name: "Test Bank",
          account_name: "Checking B",
          account_type: "depository",
          account_mask: "2222",
          current_balance_cents: 0,
          available_balance_cents: 0,
          currency_code: "USD",
          sync_status: "active",
          is_active: true,
          last_synced_at: null,
        },
      ],
    });
    vi.mocked(bankingApi.createTransfer).mockResolvedValue({
      transfer: {
        id: "xfer-1",
        operating_company_id: companyId,
        transfer_type: "bank_to_bank",
        from_account_id: acctA,
        from_account_kind: "bank",
        to_account_id: acctB,
        to_account_kind: "bank",
        amount_cents: 5000,
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

  it("submits POST /api/v1/banking/transfers via createTransfer when form is valid", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const onClose = vi.fn();

    render(
      wrap(
        <TransferModal open operatingCompanyId={companyId} onClose={onClose} onSaved={onSaved} />
      )
    );

    await waitFor(() => expect(screen.getByLabelText(/From bank account/i)).toBeInTheDocument());
    const fromSel = screen.getByLabelText(/From bank account/i);
    await waitFor(() => expect(within(fromSel).getAllByRole("option").length).toBeGreaterThanOrEqual(3));

    await user.selectOptions(fromSel, acctA);
    await user.selectOptions(screen.getByLabelText(/To bank account/i), acctB);
    await user.type(screen.getByLabelText(/^Amount \(USD\)/i), "50");
    await user.click(screen.getByRole("button", { name: /Save transfer/i }));

    await waitFor(() => expect(bankingApi.createTransfer).toHaveBeenCalledTimes(1));
    expect(bankingApi.createTransfer).toHaveBeenCalledWith(
      companyId,
      expect.objectContaining({
        transfer_type: "bank_to_bank",
        from_account_id: acctA,
        to_account_id: acctB,
        amount_cents: 5000,
      })
    );
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
