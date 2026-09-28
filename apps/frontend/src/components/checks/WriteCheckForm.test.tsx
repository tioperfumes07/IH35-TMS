import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import * as checksApi from "../../api/checks";
import * as accountingApi from "../../api/accounting";
import * as bankingApi from "../../api/banking";
import { WriteCheckForm } from "./WriteCheckForm";

// ReferenceSelect/DriverPickerWithCreate carry their own deep query/combobox machinery (server
// search, inline create) -- out of scope for this form's own unit test, and already covered by
// their own test suites. Mocked to a plain <select> so this form's OWN state/gating logic (Save
// disabled until required fields are set, the 3 data-source queries fire) is what's under test.
vi.mock("../parity/ReferenceSelect", () => ({
  ReferenceSelect: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string | null;
    onChange: (v: string | null) => void;
    placeholder?: string;
  }) => (
    <select aria-label={placeholder ?? "Reference"} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder ?? "Select…"}</option>
      <option value="fake-vendor-1">Fake Vendor One</option>
    </select>
  ),
}));

vi.mock("../drivers/DriverPickerWithCreate", () => ({
  DriverPickerWithCreate: ({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) => (
    <select aria-label="Select driver…" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Select driver…</option>
    </select>
  ),
}));

const BANK_ACCOUNTS = {
  bank_accounts: [
    { id: "ba-1", account_name: "USMCA Checking", ledger_account_id: "acct-1000", ledger_account_name: "Checking", ledger_account_number: "1000" },
  ],
  coa_cash_accounts: [],
};
const CATEGORY_ROWS = {
  rows: [
    {
      id: "map-1",
      operating_company_id: "co-1",
      category_kind: "maintenance" as const,
      category_code: "maintenance",
      account_id: "acct-6000",
      account_number: "6000",
      account_name: "Repairs & Maintenance",
      posting_side: "debit" as const,
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ],
};

function renderForm(onSaved = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    onSaved,
    ...render(
      <QueryClientProvider client={qc}>
        <WriteCheckForm open operatingCompanyId="co-1" onClose={vi.fn()} onSaved={onSaved} />
      </QueryClientProvider>
    ),
  };
}

describe("WriteCheckForm", () => {
  it("mounts and queries its bank-account and category-map data sources", async () => {
    const bankSpy = vi.spyOn(bankingApi, "getCashGlMapping").mockResolvedValue(BANK_ACCOUNTS);
    const catSpy = vi.spyOn(accountingApi, "listExpenseCategoryMappings").mockResolvedValue({ rows: [] });
    renderForm();
    await waitFor(() => {
      expect(bankSpy).toHaveBeenCalledWith("co-1");
      expect(catSpy).toHaveBeenCalledWith("co-1");
    });
  });

  it("Save starts disabled -- payee, bank account, check number, and a priced line are all required", async () => {
    vi.spyOn(bankingApi, "getCashGlMapping").mockResolvedValue(BANK_ACCOUNTS);
    vi.spyOn(accountingApi, "listExpenseCategoryMappings").mockResolvedValue(CATEGORY_ROWS);
    renderForm();
    const saveButton = await screen.findByRole("button", { name: "Save" });
    expect(saveButton).toBeDisabled();
  });

  it("never calls createCheck just from mounting or picking a payee alone", async () => {
    vi.spyOn(bankingApi, "getCashGlMapping").mockResolvedValue(BANK_ACCOUNTS);
    vi.spyOn(accountingApi, "listExpenseCategoryMappings").mockResolvedValue(CATEGORY_ROWS);
    const createSpy = vi.spyOn(checksApi, "createCheck");
    const { onSaved } = renderForm();

    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText("Select vendor…"), "fake-vendor-1");

    expect(createSpy).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
