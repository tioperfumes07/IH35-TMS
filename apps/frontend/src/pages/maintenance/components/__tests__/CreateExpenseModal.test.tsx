import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CreateExpenseModal } from "../CreateExpenseModal";
import { ToastProvider } from "../../../../components/Toast";
import { createExpense } from "../../../../api/accounting";
import { MemoryRouter } from "react-router-dom";

const VENDOR_ID = "11111111-1111-4111-8111-111111111111";
const ACCT_ID = "22222222-2222-4222-8222-222222222222";
const WO_ID = "33333333-3333-4333-8333-333333333333";
const UNIT_ID = "44444444-4444-4444-8444-444444444444";

vi.mock("../../../../api/accounting", () => ({
  createExpense: vi.fn(() =>
    Promise.resolve({ expense_id: "exp-1", posting_status: "unposted", journal_entry_id: null })
  ),
}));
vi.mock("../../../../api/mdata", () => ({
  listVendors: vi.fn(() => Promise.resolve({ vendors: [{ id: VENDOR_ID, name: "Ace Parts" }] })),
  listDrivers: vi.fn(() => Promise.resolve({ drivers: [] })),
  listUnits: vi.fn(() => Promise.resolve({ units: [{ id: UNIT_ID, unit_number: "T-101" }] })),
  // CreateDriverModal (nested "+ Create" on the payee/driver picker) references these as
  // useMutation's mutationFn at render time — must be defined even though this test never submits.
  createDriver: vi.fn(),
  checkReturningDriver: vi.fn(),
  createUnit: vi.fn(),
}));
vi.mock("../../../../api/maintenance", () => ({
  getWoCostContext: vi.fn(() =>
    Promise.resolve({ expense_categories: [{ id: "cat-1", name: "Office Supplies", qbo_id: "CAT-QBO-1" }] })
  ),
}));
vi.mock("../../../../api/catalog-accounts", () => ({
  listCatalogAccounts: vi.fn(() =>
    Promise.resolve({
      accounts: [
        {
          id: ACCT_ID,
          account_number: "1000",
          account_name: "Cash",
          // account_type "Bank", not "Asset": ACCT-F92 narrowed the Payment-account picker to
          // Bank/CreditCard (plus cash-like Asset SUBTYPES) so an expense cannot be recorded as paid FROM
          // Accumulated Depreciation or A/R. A bare "Asset" is correctly rejected, so the option never
          // rendered — the fixture was stale against a deliberate product fix.
          account_type: "Bank",
          is_postable: true,
          deactivated_at: null,
        },
      ],
    })
  ),
}));

vi.mock("../../../../components/parity/ParityDrawer", () => ({
  ParityDrawer: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="parity-drawer">{children}</div> : null,
}));
vi.mock("../../../../components/UploadZone", () => ({ UploadZone: () => <div /> }));
vi.mock("../../../../components/shared/SelectCombobox", () => ({
  SelectCombobox: ({ id, value, onChange, children, className }: any) => (
    <select id={id} className={className} value={value} onChange={onChange}>
      {children}
    </select>
  ),
}));
vi.mock("../../../../components/parity/ReferenceSelect", () => ({
  ReferenceSelect: ({
    value,
    onChange,
    options,
    placeholder,
    id,
  }: {
    value: string | null;
    onChange: (v: string | null) => void;
    options: Array<{ value: string; label: string }>;
    placeholder?: string;
    id?: string;
  }) => (
    <select
      // Forward the id like the real ReferenceSelect now does, so <label htmlFor> binds and
      // getByLabelText addresses the control instead of "no form control was found".
      id={id}
      aria-label={placeholder ?? "Reference"}
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

function renderModal(onClose = vi.fn(), extra?: { linkedUnitId?: string }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      {/* These modals use react-router now; with no Router in scope React Router throws
          "Cannot destructure property 'basename'", which reads as a component crash rather than a
          missing test wrapper. */}
      <MemoryRouter>
      <ToastProvider>
        <CreateExpenseModal
          open={true}
          operatingCompanyId="91e0bf0a-133f-4ce8-a734-2586cfa66d96"
          linkedWoDisplayId="WO-TEST"
          linkedWoId={WO_ID}
          linkedUnitId={extra?.linkedUnitId}
          onClose={onClose}
        />
      </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { onClose, invalidateSpy };
}

describe("CreateExpenseModal — persists via the canonical createExpense endpoint", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fires createExpense with category + payment account + payee + WO link, then closes + invalidates", async () => {
    const user = userEvent.setup();
    const { onClose, invalidateSpy } = renderModal(vi.fn(), { linkedUnitId: UNIT_ID });

    const form = await screen.findByTestId("record-expense-form");
    await screen.findByRole("option", { name: "Office Supplies" });
    // The account option renders as "Cash" (the picker no longer prefixes the account number, so the old
    // "1000 · Cash" name never matched), and plain text is ambiguous — "Cash" is also a payment METHOD.
    // Wait on the option's VALUE inside the account select instead.
    await waitFor(() =>
      expect(document.querySelector(`option[value="${ACCT_ID}"]`)).toBeTruthy(),
    );
    await screen.findByRole("option", { name: "Ace Parts" });

    await user.selectOptions(within(form).getByLabelText(/select category/i), "cat-1");
    await user.selectOptions(within(form).getByLabelText(/select vendor/i), VENDOR_ID);
    await user.type(within(form).getByLabelText(/amount/i), "100");
    await user.selectOptions(within(form).getByLabelText(/payment method/i), "cash");
    await user.selectOptions(within(form).getByLabelText(/payment account/i), ACCT_ID);

    await user.click(screen.getByTestId("create-expense-submit"));

    await waitFor(() => expect(createExpense).toHaveBeenCalledTimes(1));
    const [opId, body] = (createExpense as unknown as { mock: { calls: any[][] } }).mock.calls[0];
    expect(opId).toBe("91e0bf0a-133f-4ce8-a734-2586cfa66d96");
    expect(body.category_qbo_id).toBe("CAT-QBO-1");
    expect(body.payment_account_uuid).toBe(ACCT_ID);
    expect(body.amount_cents).toBe(10000);
    expect(body.vendor_uuid).toBe(VENDOR_ID);
    expect(body.work_order_id).toBe(WO_ID);
    expect(body.unit_id).toBe(UNIT_ID);
    expect(body.memo).toContain("WO: WO-TEST");
    expect(body.expense_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof body.attachment_draft_id).toBe("string");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["accounting", "expenses"] });

    // LINK-F5189: the modal holds a confirmation step (real EntityLink to the just-created expense)
    // instead of closing straight past it — onClose only fires once the operator dismisses it.
    await screen.findByTestId("create-expense-modal-view-expense");
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("does not submit without a category (canonical required field guarded)", async () => {
    const user = userEvent.setup();
    renderModal();
    const form = await screen.findByTestId("record-expense-form");
    // The account option renders as "Cash" (the picker no longer prefixes the account number, so the old
    // "1000 · Cash" name never matched), and plain text is ambiguous — "Cash" is also a payment METHOD.
    // Wait on the option's VALUE inside the account select instead.
    await waitFor(() =>
      expect(document.querySelector(`option[value="${ACCT_ID}"]`)).toBeTruthy(),
    );
    await user.selectOptions(within(form).getByLabelText(/payment account/i), ACCT_ID);
    await user.type(within(form).getByLabelText(/amount/i), "100");
    await user.click(screen.getByTestId("create-expense-submit"));
    await waitFor(() => {
      expect(createExpense).not.toHaveBeenCalled();
    });
  });
});
