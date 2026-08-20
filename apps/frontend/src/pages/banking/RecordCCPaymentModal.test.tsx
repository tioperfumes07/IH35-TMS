import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as bankingApi from "../../api/banking";
import * as mdataApi from "../../api/mdata";
import * as catalogAccountsApi from "../../api/catalog-accounts";
import { ToastProvider } from "../../components/Toast";
import { RecordCCPaymentModal } from "./RecordCCPaymentModal";

// 2026-08-20 (CC-3): the vendor/liability-account pickers migrated off the old QboCombobox mock
// pattern (`qbo-combo-vendor` / `qbo-combo-account` testids) onto the real, shared ReferenceSelect
// (LST-PICKER-01 — real listVendors/listCatalogAccounts-backed pickers with server search + inline
// "+ Add new"). RecordCCPaymentModal.tsx no longer imports QboCombobox at all — this test now drives
// the real ReferenceSelect comboboxes instead of mocking a component that's gone.
vi.mock("../../api/mdata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/mdata")>();
  return { ...actual, listVendors: vi.fn() };
});

vi.mock("../../api/catalog-accounts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/catalog-accounts")>();
  return { ...actual, listCatalogAccounts: vi.fn() };
});

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

function openDropdown(input: HTMLElement) {
  fireEvent.focus(input);
  fireEvent.click(input);
}

describe("RecordCCPaymentModal", () => {
  const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
  const bankId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const vendorId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const liabilityAccountId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

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
    vi.mocked(mdataApi.listVendors).mockResolvedValue({
      vendors: [{ id: vendorId, name: "Amex Corporate Card", vendor_type: "credit_card" }],
      total: 1,
    } as never);
    vi.mocked(catalogAccountsApi.listCatalogAccounts).mockResolvedValue({
      accounts: [
        {
          id: liabilityAccountId,
          account_name: "Amex Credit Card Liability",
          account_type: "Liability",
          account_subtype: "credit_card",
          is_postable: true,
          deactivated_at: null,
        },
      ],
    } as never);
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

    const vendorInput = await screen.findByPlaceholderText("Search vendor…");
    openDropdown(vendorInput);
    fireEvent.click(await screen.findByRole("option", { name: /Amex Corporate Card/i }));

    const accountInput = await screen.findByPlaceholderText("Select liability account…");
    openDropdown(accountInput);
    fireEvent.click(await screen.findByRole("option", { name: /Amex Credit Card Liability/i }));

    // "Pay from bank account" is also a Combobox now (SelectCombobox is a Combobox adapter, not a
    // native <select> — CLS-BOX-IN-BOX), so it opens/selects the same way as the other pickers.
    const bankInput = await screen.findByLabelText(/Pay from bank account/i);
    openDropdown(bankInput);
    fireEvent.click(await screen.findByRole("option", { name: /Operating Bank - Ops/i }));
    await user.type(screen.getByLabelText(/^Amount \(USD\)/i), "25");

    await user.click(screen.getByRole("button", { name: /Record payment/i }));

    await waitFor(() => expect(bankingApi.recordCcPayment).toHaveBeenCalledTimes(1));
    expect(bankingApi.recordCcPayment).toHaveBeenCalledWith(
      companyId,
      expect.objectContaining({
        cc_vendor_id: vendorId,
        cc_liability_coa_account_id: liabilityAccountId,
        from_bank_account_id: bankId,
        amount_cents: 2500,
      })
    );
    expect(onSaved).toHaveBeenCalled();
  });
});
