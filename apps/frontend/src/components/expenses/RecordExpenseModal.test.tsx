import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as accountingApi from "../../api/accounting";
import * as maintenanceApi from "../../api/maintenance";
import * as mdataApi from "../../api/mdata";
import { ToastProvider } from "../Toast";
import { RecordExpenseModal } from "./RecordExpenseModal";

vi.mock("../../api/accounting", () => ({
  createExpense: vi.fn().mockResolvedValue({ expense_id: "exp-1", posting_status: "unposted", journal_entry_id: null }),
}));

vi.mock("../../api/catalog-accounts", () => ({
  listCatalogAccounts: vi.fn().mockResolvedValue({
    accounts: [
      { id: "acct-1", account_number: "1000", account_name: "Cash", account_type: "Asset", is_postable: true, deactivated_at: null },
    ],
  }),
}));

vi.mock("../../api/maintenance", () => ({
  getWoCostContext: vi.fn().mockResolvedValue({
    expense_categories: [{ id: "cat-1", name: "Fuel", qbo_id: "qbo-1" }],
    items: [],
    parts: [],
  }),
}));

vi.mock("../../api/mdata", () => ({
  listUnits: vi.fn().mockResolvedValue({ units: [{ id: "unit-1", unit_number: "T-101" }] }),
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
    await waitFor(() => expect(mdataApi.listUnits).toHaveBeenCalled());

    await user.selectOptions(screen.getByLabelText(/^category/i), "cat-1");
    await user.type(screen.getByLabelText(/amount/i), "42.50");
    await user.selectOptions(screen.getByLabelText(/payment method/i), "cash");
    await user.selectOptions(screen.getByLabelText(/payment account/i), "acct-1");
    const form = screen.getByTestId("record-expense-form");
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
      })
    );
  });
});
