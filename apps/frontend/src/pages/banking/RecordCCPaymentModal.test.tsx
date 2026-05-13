import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as bankingApi from "../../api/banking";
import { ToastProvider } from "../../components/Toast";
import { RecordCCPaymentModal } from "./RecordCCPaymentModal";

vi.mock("../../components/forms/QboCombobox", () => ({
  QboCombobox: ({
    entityType,
    onChange,
  }: {
    entityType: string;
    onChange: (id: string | null, name: string) => void;
  }) => (
    <button type="button" data-testid={`qbo-combo-${entityType}`} onClick={() => onChange("qbo-pick-1", "Picked")}>
      Choose {entityType}
    </button>
  ),
}));

vi.mock("../../api/banking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/banking")>();
  return {
    ...actual,
    getPlaidBankAccounts: vi.fn(),
    recordCcPayment: vi.fn(),
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

describe("RecordCCPaymentModal", () => {
  const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
  const bankId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  beforeEach(() => {
    vi.mocked(bankingApi.getPlaidBankAccounts).mockResolvedValue({
      accounts: [
        {
          id: bankId,
          operating_company_id: companyId,
          institution_name: "Operating Bank",
          account_name: "Ops",
          account_type: "depository",
          account_mask: "3333",
          current_balance_cents: 0,
          available_balance_cents: 0,
          currency_code: "USD",
          sync_status: "active",
          is_active: true,
          last_synced_at: null,
        },
      ],
    });
    vi.mocked(bankingApi.recordCcPayment).mockResolvedValue({
      transfer: {
        id: "cc-1",
        operating_company_id: companyId,
        transfer_type: "cc_payment",
        from_account_id: bankId,
        from_account_kind: "bank",
        to_account_id: "coa-x",
        to_account_kind: "coa",
        amount_cents: 2500,
        transfer_date: "2026-05-10",
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

  it("calls recordCcPayment after vendor, liability COA, bank, and amount are set", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(
      wrap(
        <RecordCCPaymentModal open operatingCompanyId={companyId} onClose={vi.fn()} onSaved={onSaved} />
      )
    );

    await waitFor(() => expect(screen.getByTestId("qbo-combo-vendor")).toBeInTheDocument());
    await user.click(screen.getByTestId("qbo-combo-vendor"));
    await user.click(screen.getByTestId("qbo-combo-account"));
    await waitFor(() => expect(screen.getByLabelText(/Pay from bank account/i)).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText(/Pay from bank account/i), bankId);
    await user.type(screen.getByLabelText(/^Amount \(USD\)/i), "25");

    await user.click(screen.getByRole("button", { name: /Record payment/i }));

    await waitFor(() => expect(bankingApi.recordCcPayment).toHaveBeenCalledTimes(1));
    expect(bankingApi.recordCcPayment).toHaveBeenCalledWith(
      companyId,
      expect.objectContaining({
        cc_liability_coa_account_id: "qbo-pick-1",
        from_bank_account_id: bankId,
        amount_cents: 2500,
      })
    );
    expect(onSaved).toHaveBeenCalled();
  });
});
