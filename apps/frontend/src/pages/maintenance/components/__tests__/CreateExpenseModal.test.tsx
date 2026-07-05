import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CreateExpenseModal } from "../CreateExpenseModal";
import { ToastProvider } from "../../../../components/Toast";
import { createExpense } from "../../../../api/accounting";

const VENDOR_ID = "11111111-1111-4111-8111-111111111111";
const ACCT_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("../../../../api/accounting", () => ({
  createExpense: vi.fn(() =>
    Promise.resolve({ expense_id: "exp-1", posting_status: "unposted", journal_entry_id: null })
  ),
}));
vi.mock("../../../../api/mdata", () => ({
  listVendors: vi.fn(() => Promise.resolve({ vendors: [{ id: VENDOR_ID, name: "Ace Parts" }] })),
  listDrivers: vi.fn(() => Promise.resolve({ drivers: [] })),
  listUnits: vi.fn(() => Promise.resolve({ units: [] })),
}));
vi.mock("../../../../api/maintenance", () => ({
  getWoCostContext: vi.fn(() =>
    Promise.resolve({ expense_categories: [{ id: "cat-1", name: "Fuel Category", qbo_id: "CAT-QBO-1" }] })
  ),
}));
vi.mock("../../../../api/catalog-accounts", () => ({
  listCatalogAccounts: vi.fn(() =>
    Promise.resolve({
      accounts: [
        { id: ACCT_ID, account_number: "1000", account_name: "Cash", account_type: "Asset", is_postable: true, deactivated_at: null },
      ],
    })
  ),
}));

vi.mock("../../../../components/Modal", () => ({
  Modal: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="modal">{children}</div> : null,
}));
vi.mock("../../../../components/forms/TwoSectionLineEditor", () => ({
  TwoSectionLineEditor: ({ onChange }: { onChange: (lines: unknown[]) => void }) => (
    <button
      type="button"
      data-testid="inject-lines"
      onClick={() => onChange([{ id: "l1", section: "A", description: "diesel", amount: 100 }])}
    >
      inject
    </button>
  ),
}));
vi.mock("../../../../components/forms/shared/TotalsStack", () => ({ TotalsStack: () => <div /> }));
vi.mock("../../../../components/UploadZone", () => ({ UploadZone: () => <div /> }));
vi.mock("../../../../components/shared/SelectCombobox", () => ({
  SelectCombobox: ({ value, onChange, children, className }: any) => (
    <select className={className} value={value} onChange={onChange}>
      {children}
    </select>
  ),
}));

function renderModal(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CreateExpenseModal
          open={true}
          operatingCompanyId="91e0bf0a-133f-4ce8-a734-2586cfa66d96"
          onClose={onClose}
        />
      </ToastProvider>
    </QueryClientProvider>
  );
  return { onClose, invalidateSpy };
}

describe("CreateExpenseModal — persists via the canonical createExpense endpoint", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fires createExpense with category + payment account + payee link, then closes + invalidates", async () => {
    const { onClose, invalidateSpy } = renderModal();

    const categoryOption = await screen.findByRole("option", { name: "Fuel Category" });
    fireEvent.change(categoryOption.closest("select")!, { target: { value: "cat-1" } });
    const acctOption = await screen.findByRole("option", { name: "1000 · Cash" });
    fireEvent.change(acctOption.closest("select")!, { target: { value: ACCT_ID } });
    const payeeOption = await screen.findByRole("option", { name: "Ace Parts" });
    fireEvent.change(payeeOption.closest("select")!, { target: { value: VENDOR_ID } });
    fireEvent.click(screen.getByTestId("inject-lines"));

    fireEvent.click(screen.getByTestId("create-expense-submit"));

    await waitFor(() => expect(createExpense).toHaveBeenCalledTimes(1));
    const [opId, body] = (createExpense as unknown as { mock: { calls: any[][] } }).mock.calls[0];
    expect(opId).toBe("91e0bf0a-133f-4ce8-a734-2586cfa66d96");
    expect(body.category_qbo_id).toBe("CAT-QBO-1");
    expect(body.payment_account_uuid).toBe(ACCT_ID);
    expect(body.amount_cents).toBe(10825); // 100 + 8.25% tax
    expect(body.vendor_uuid).toBe(VENDOR_ID); // payee FK linkage
    expect(body.expense_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof body.attachment_draft_id).toBe("string");

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["accounting", "expenses"] });
  });

  it("does not submit without a category (canonical required field guarded)", async () => {
    renderModal();
    const acctOption = await screen.findByRole("option", { name: "1000 · Cash" });
    fireEvent.change(acctOption.closest("select")!, { target: { value: ACCT_ID } });
    fireEvent.click(screen.getByTestId("inject-lines"));
    // category missing → button disabled → no call
    fireEvent.click(screen.getByTestId("create-expense-submit"));
    expect(createExpense).not.toHaveBeenCalled();
  });
});
