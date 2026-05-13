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

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

function accountSelectElements() {
  return screen.getAllByRole("combobox").filter((el) => {
    const sel = el as HTMLSelectElement;
    return sel.options[0]?.textContent?.trim() === "Account";
  });
}

describe("ManualJEModal", () => {
  const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";

  beforeEach(() => {
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

    await waitFor(() => expect(accountSelectElements().length).toBeGreaterThanOrEqual(2));

    const accounts = accountSelectElements();
    const debitBoxes = screen.getAllByPlaceholderText("Debit");
    const creditBoxes = screen.getAllByPlaceholderText("Credit");

    await user.selectOptions(accounts[0], "acc-cash");
    await user.clear(debitBoxes[0]);
    await user.type(debitBoxes[0], "100");
    await user.selectOptions(accounts[1], "acc-apy");
    await user.clear(creditBoxes[1]);
    await user.type(creditBoxes[1], "100");

    expect(screen.getByRole("button", { name: /Continue to Confirm/i })).not.toBeDisabled();
  });

  it("posts journal only from step 2 via createJournalEntry", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(wrap(<ManualJEModal open operatingCompanyId={companyId} onClose={vi.fn()} onSaved={onSaved} />));

    await waitFor(() => expect(accountingApi.listCoaAccountsForJe).toHaveBeenCalled());
    await waitFor(() => expect(accountSelectElements().length).toBeGreaterThanOrEqual(2));

    const accounts = accountSelectElements();
    const debitBoxes = screen.getAllByPlaceholderText("Debit");
    const creditBoxes = screen.getAllByPlaceholderText("Credit");

    await user.selectOptions(accounts[0], "acc-cash");
    await user.clear(debitBoxes[0]);
    await user.type(debitBoxes[0], "75");
    await user.selectOptions(accounts[1], "acc-apy");
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
});
