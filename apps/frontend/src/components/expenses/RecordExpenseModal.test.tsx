import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as accountingApi from "../../api/accounting";
import * as maintenanceApi from "../../api/maintenance";
import { ToastProvider } from "../Toast";
import { RecordExpenseModal } from "./RecordExpenseModal";

vi.mock("../../api/accounting", () => ({
  createExpense: vi.fn().mockResolvedValue({ expense_id: "exp-1", posting_status: "unposted", journal_entry_id: null }),
  getNextExpenseDocumentNumber: vi.fn().mockResolvedValue({ document_number: "EXP-2026-00001" }),
}));

vi.mock("../../api/catalog-accounts", () => ({
  listCatalogAccounts: vi.fn().mockResolvedValue({
    accounts: [
      // account_type "Bank", not "Asset": ACCT-F92 narrowed the Payment-account picker to Bank/CreditCard
      // (plus cash-like Asset SUBTYPES) precisely so an expense could not be recorded as paid FROM
      // Accumulated Depreciation or A/R. This fixture still described a bare "Asset", which the corrected
      // filter rightly rejects — the fixture was stale against a deliberate product fix, so the fixture moved.
      { id: "acct-1", account_number: "1000", account_name: "Cash", account_type: "Bank", is_postable: true, deactivated_at: null },
    ],
  }),
}));

vi.mock("../../api/maintenance", () => ({
  getWoCostContext: vi.fn().mockResolvedValue({
    expense_categories: [{ id: "cat-1", name: "Office Supplies", qbo_id: "qbo-1" }],
    items: [],
    parts: [],
  }),
}));

vi.mock("../../api/mdata", () => ({
  listUnits: vi.fn().mockResolvedValue({ units: [{ id: "unit-1", unit_number: "T-101" }] }),
  listVendors: vi.fn().mockResolvedValue({ vendors: [] }),
}));

vi.mock("../parity/EntityPicker", () => ({
  EntityPicker: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string | null;
    onChange: (v: string | null) => void;
    placeholder?: string;
  }) => (
    <select aria-label={placeholder ?? "Select unit…"} value={value ?? ""} onChange={(event) => onChange(event.target.value || null)}>
      <option value="">{placeholder ?? "Select unit…"}</option>
      <option value="unit-1">T-101</option>
    </select>
  ),
}));

vi.mock("../UploadZone", () => ({
  UploadZone: () => <div data-testid="upload-zone-mock">upload</div>,
}));

// Render the custom typeahead as a native <select> so the test can drive it deterministically.
vi.mock("../shared/SelectCombobox", () => ({
  SelectCombobox: ({ id, value, onChange, children }: { id?: string; value?: string; onChange?: (e: unknown) => void; children?: React.ReactNode }) => (
    <select id={id} value={value} onChange={onChange}>
      {children}
    </select>
  ),
}));

// Doc-19-B: Category is now the shared ReferenceSelect (inline "+ Add new category"). Render it as a
// native <select> so the test drives the existing-category select path deterministically; onChange takes
// the option value (or null), matching the real ReferenceSelect contract.
vi.mock("../parity/ReferenceSelect", () => ({
  ReferenceSelect: ({
    value,
    onChange,
    options,
    placeholder,
    createKind,
  }: {
    value: string | null;
    onChange: (v: string | null) => void;
    options: Array<{ value: string; label: string }>;
    placeholder?: string;
    createKind?: string;
  }) => (
    <select
      aria-label={placeholder ?? createKind ?? "Reference"}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || null)}
    >
      <option value="">{placeholder ?? "Select…"}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("../forms/QboCombobox", () => ({
  QboCombobox: ({
    onChange,
  }: {
    onChange: (qboId: string | null, displayName: string) => void;
  }) => (
    <input aria-label="Vendor" onChange={(event) => onChange("vendor-qbo-1", event.target.value)} />
  ),
}));

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("RecordExpenseModal", () => {
  it("submits a categorized cash-out via createExpense (not a bill)", async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <RecordExpenseModal open operatingCompanyId="00000000-0000-0000-0000-000000000001" onClose={() => undefined} />
      )
    );

    await waitFor(() => expect(maintenanceApi.getWoCostContext).toHaveBeenCalled());

    const form = screen.getByTestId("record-expense-form");
    await screen.findByDisplayValue("EXP-2026-00001");
    // Vendor + Category + Payment account use ReferenceSelect (mocked as <select aria-label=placeholder>).
    // The Category picker is mocked here as a native <select>, so selectOptions IS the right API — the
    // failure was never a widget mismatch. Its OPTIONS arrive asynchronously: categoryOptions prefers the
    // chart-of-accounts query and only falls back to getWoCostContext's expense_categories
    // (RecordExpenseForm.tsx), so on the first tick the select holds just the placeholder and
    // selectOptions throws `Value "cat-1" not found in options` — a message that names the id and reads
    // like a missing fixture row rather than "the list has not loaded yet".
    const categorySelect = within(form).getByLabelText(/select category/i);
    await waitFor(() => expect(within(categorySelect).getByRole("option", { name: "Office Supplies" })).toBeInTheDocument());
    await user.selectOptions(categorySelect, "cat-1");
    await user.type(within(form).getByLabelText(/amount/i), "42.50");
    await user.selectOptions(within(form).getByLabelText(/payment method/i), "cash");
    // Same async shape as Category above: the accounts list arrives after first paint.
    const accountSelect = within(form).getByLabelText(/bank\/cash account/i);
    await waitFor(() =>
      expect(accountSelect.querySelector('option[value="acct-1"]')).toBeInTheDocument(),
    );
    await user.selectOptions(accountSelect, "acct-1");
    await user.click(within(form).getByRole("button", { name: /record expense/i }));

    await waitFor(() => expect(accountingApi.createExpense).toHaveBeenCalledTimes(1));
    expect(accountingApi.createExpense).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000001",
      expect.objectContaining({
        category_qbo_id: "qbo-1",
        payment_account_uuid: "acct-1",
        amount_cents: 4250,
        expense_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        memo: expect.stringContaining("Expense capture"),
        attachment_draft_id: expect.any(String),
        expense_number: "EXP-2026-00001",
      })
    );
  });
});
