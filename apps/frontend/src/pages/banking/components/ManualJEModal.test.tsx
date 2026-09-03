import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as accountingApi from "../../../api/accounting";
import { ToastProvider } from "../../../components/Toast";
import { ManualJEModal } from "./ManualJEModal";

vi.mock("../../../api/accounting", () => ({
  listCoaAccountsForJe: vi.fn(),
  listClassesForJe: vi.fn(),
  createJournalEntry: vi.fn(),
}));

// BANK-F5330 / P23-BANKING-RAW-UUID-BACKEND-GAPS — EntityPicker's own roster-fetch/registry wiring
// has its own coverage (verify-picker-law-no-raw-uuid.mjs + the registry's tests); this test is
// about ManualJEModal's wiring TO it (kind select → picker → payload), so it stands in for the real
// picker with a minimal control that exposes the same value/onChange contract.
vi.mock("../../../components/EntityPicker", () => ({
  EntityPicker: ({ kind, value, onChange }: { kind: string; value: string | null; onChange: (v: string | null) => void }) => (
    <input
      data-testid={`entity-picker-${kind}`}
      placeholder={`Select ${kind}`}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    />
  ),
}));

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

// ManualJEModal.tsx's account field is the shared Combobox component (typeahead input +
// findByRole("option")), not a native <select> -- account_number/account_name.map(a => ({
// value: a.id, label: a.account_name })) means the option label is the plain account name
// ("Cash", "A/P"), no number prefix.
function accountComboboxes() {
  return screen.getAllByPlaceholderText("Account");
}

async function selectAccount(user: ReturnType<typeof userEvent.setup>, lineIndex: number, optionName: RegExp | string) {
  const comboboxes = accountComboboxes();
  await user.click(comboboxes[lineIndex]);
  await user.click(await screen.findByRole("option", { name: optionName }));
}

describe("ManualJEModal", () => {
  const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";

  beforeEach(() => {
    // Test isolation: this file's vi.mock factory creates ONE vi.fn() shared across every test in
    // the suite, so call counts otherwise accumulate across tests — a latent gap that only started
    // mattering once a second test began asserting toHaveBeenCalledTimes(1).
    vi.mocked(accountingApi.createJournalEntry).mockClear();
    vi.mocked(accountingApi.listCoaAccountsForJe).mockResolvedValue({
      accounts: [
        { id: "acc-cash", account_number: "1000", account_name: "Cash" },
        { id: "acc-apy", account_number: "2000", account_name: "A/P" },
      ],
    });
    vi.mocked(accountingApi.listClassesForJe).mockResolvedValue({ classes: [] });
    vi.mocked(accountingApi.createJournalEntry).mockResolvedValue({
      id: "je-1",
      operating_company_id: companyId,
      entry_date: "2026-05-12",
      memo: null,
      status: "posted",
      source: "manual",
      created_by_user_id: null,
      voided_at: null,
      void_reason: null,
      reversed_by_je_id: null,
      reverses_je_id: null,
      qbo_journal_entry_id: null,
      qbo_sync_pending: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  it("keeps Continue disabled until debits equal credits with a positive amount", async () => {
    const user = userEvent.setup();
    render(wrap(<ManualJEModal open operatingCompanyId={companyId} onClose={vi.fn()} onSaved={vi.fn()} />));

    await waitFor(() => expect(accountingApi.listCoaAccountsForJe).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("button", { name: /Continue to Confirm/i })).toBeDisabled());

    await waitFor(() => expect(accountComboboxes().length).toBeGreaterThanOrEqual(2));

    const debitBoxes = screen.getAllByPlaceholderText("Debit");
    const creditBoxes = screen.getAllByPlaceholderText("Credit");

    await selectAccount(user, 0, /^Cash$/);
    await user.clear(debitBoxes[0]);
    await user.type(debitBoxes[0], "100");
    await selectAccount(user, 1, /^A\/P$/);
    await user.clear(creditBoxes[1]);
    await user.type(creditBoxes[1], "100");

    expect(screen.getByRole("button", { name: /Continue to Confirm/i })).not.toBeDisabled();
  });

  it("posts journal only from step 2 via createJournalEntry", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(wrap(<ManualJEModal open operatingCompanyId={companyId} onClose={vi.fn()} onSaved={onSaved} />));

    await waitFor(() => expect(accountingApi.listCoaAccountsForJe).toHaveBeenCalled());
    await waitFor(() => expect(accountComboboxes().length).toBeGreaterThanOrEqual(2));

    const debitBoxes = screen.getAllByPlaceholderText("Debit");
    const creditBoxes = screen.getAllByPlaceholderText("Credit");

    await selectAccount(user, 0, /^Cash$/);
    await user.clear(debitBoxes[0]);
    await user.type(debitBoxes[0], "75");
    await selectAccount(user, 1, /^A\/P$/);
    await user.clear(creditBoxes[1]);
    await user.type(creditBoxes[1], "75");

    await user.click(screen.getByRole("button", { name: /Continue to Confirm/i }));

    expect(await screen.findByRole("button", { name: /Post journal entry/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Memo$/i), "Month-end true-up");
    await user.click(screen.getByRole("button", { name: /Post journal entry/i }));

    await waitFor(() => expect(accountingApi.createJournalEntry).toHaveBeenCalledTimes(1));
    expect(accountingApi.createJournalEntry).toHaveBeenCalledWith(
      companyId,
      expect.objectContaining({
        source: "manual",
        postings: expect.arrayContaining([
          expect.objectContaining({ debit_or_credit: "debit", amount_cents: 7500 }),
          expect.objectContaining({ debit_or_credit: "credit", amount_cents: 7500 }),
        ]),
      })
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("never renders a raw entity-uuid text input", async () => {
    render(wrap(<ManualJEModal open operatingCompanyId={companyId} onClose={vi.fn()} onSaved={vi.fn()} />));
    await waitFor(() => expect(accountingApi.listCoaAccountsForJe).toHaveBeenCalled());
    expect(screen.queryByPlaceholderText(/entity uuid/i)).not.toBeInTheDocument();
  });

  it("posts entity_type paired with entity_uuid once a kind + picker value are set (BANK-F5330 / P23)", async () => {
    const user = userEvent.setup();
    render(wrap(<ManualJEModal open operatingCompanyId={companyId} onClose={vi.fn()} onSaved={vi.fn()} />));

    await waitFor(() => expect(accountingApi.listCoaAccountsForJe).toHaveBeenCalled());
    await waitFor(() => expect(accountComboboxes().length).toBeGreaterThanOrEqual(2));

    const debitBoxes = screen.getAllByPlaceholderText("Debit");
    const creditBoxes = screen.getAllByPlaceholderText("Credit");

    await selectAccount(user, 0, /^Cash$/);
    await user.clear(debitBoxes[0]);
    await user.type(debitBoxes[0], "50");
    await selectAccount(user, 1, /^A\/P$/);
    await user.clear(creditBoxes[1]);
    await user.type(creditBoxes[1], "50");

    // Line 0's entity-kind select is the first "Entity (optional)" dropdown.
    // SelectCombobox is built on the shared Combobox primitive, not a native <select> — open it and
    // click the option, rather than user.selectOptions (which targets a real <select>).
    const kindSelects = screen.getAllByDisplayValue("Entity (optional)");
    await user.click(kindSelects[0]);
    await user.click(await screen.findByText("Driver"));

    const picker = await screen.findByTestId("entity-picker-driver");
    await user.type(picker, "drv-123");

    await user.click(screen.getByRole("button", { name: /Continue to Confirm/i }));
    await user.click(await screen.findByRole("button", { name: /Post journal entry/i }));

    await waitFor(() => expect(accountingApi.createJournalEntry).toHaveBeenCalledTimes(1));
    expect(accountingApi.createJournalEntry).toHaveBeenCalledWith(
      companyId,
      expect.objectContaining({
        postings: expect.arrayContaining([
          expect.objectContaining({ entity_type: "driver", entity_uuid: "drv-123", debit_or_credit: "debit" }),
        ]),
      })
    );
  });

  it("clears the picked entity_uuid when the kind selector changes", async () => {
    const user = userEvent.setup();
    render(wrap(<ManualJEModal open operatingCompanyId={companyId} onClose={vi.fn()} onSaved={vi.fn()} />));
    await waitFor(() => expect(accountingApi.listCoaAccountsForJe).toHaveBeenCalled());

    // SelectCombobox is built on the shared Combobox primitive, not a native <select> — open it and
    // click the option, rather than user.selectOptions (which targets a real <select>).
    const kindSelects = screen.getAllByDisplayValue("Entity (optional)");
    await user.click(kindSelects[0]);
    await user.click(await screen.findByText("Driver"));
    const driverPicker = await screen.findByTestId("entity-picker-driver");
    await user.type(driverPicker, "drv-123");
    expect(driverPicker).toHaveValue("drv-123");

    await user.click(kindSelects[0]);
    await user.click(await screen.findByText("Vendor"));
    expect(screen.queryByTestId("entity-picker-driver")).not.toBeInTheDocument();
    const vendorPicker = await screen.findByTestId("entity-picker-vendor");
    expect(vendorPicker).toHaveValue("");
  });
});
