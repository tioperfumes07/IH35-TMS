import { describe, expect, it } from "vitest";
import { buildBankTransferPickerOptions, formatBankAccountPickerLabel } from "./transferAccountPicker";

describe("transferAccountPicker — QBO-parity From/To banks", () => {
  it("includes non-Plaid bank accounts (Relay Fuel Wallet class)", () => {
    const options = buildBankTransferPickerOptions({
      bankAccounts: [
        {
          id: "bank-wf",
          display_name: "BUSINESS CHECKING ...6103",
          institution_name: "Wells Fargo",
          account_mask: "6103",
          ledger_account_id: "coa-wf",
        },
        {
          id: "bank-relay",
          display_name: "Relay Fuel Wallet",
          account_name: "Relay Fuel Wallet",
          institution_name: null,
          account_mask: null,
          ledger_account_id: "coa-relay-1295",
        },
      ],
      coaAccounts: [
        { id: "coa-relay-1295", account_number: "1295", account_name: "Relay Fuel Wallet", account_type: "Asset" },
        { id: "coa-loan", account_number: "2500", account_name: "Loan Payable", account_type: "Liability" },
        { id: "coa-fuel-exp", account_number: "6100", account_name: "Fuel Expense", account_type: "Expense" },
      ],
    });

    const ids = options.map((o) => o.id);
    expect(ids).toContain("bank-relay");
    expect(ids).toContain("bank-wf");
    expect(ids).toContain("coa-loan");
    // Linked CoA for Relay must not duplicate the bank row
    expect(ids).not.toContain("coa-relay-1295");
    // Expenses never in Transfer From/To
    expect(ids).not.toContain("coa-fuel-exp");

    const relay = options.find((o) => o.id === "bank-relay");
    expect(relay?.kind).toBe("bank");
    expect(relay?.name).toBe("Relay Fuel Wallet");
  });

  it("formats institution + mask labels for Plaid-style rows", () => {
    expect(
      formatBankAccountPickerLabel({
        id: "x",
        institution_name: "Wells Fargo",
        account_name: "Checking",
        account_mask: "3500",
      })
    ).toBe("Wells Fargo - Checking ••••3500");
  });
});
