// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as accountingApi from "../../../api/accounting";
import { ToastProvider } from "../../Toast";
import { ManualJEModal } from "../ManualJEModal";

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

async function selectAccount(user: ReturnType<typeof userEvent.setup>, lineIndex: number, optionName: RegExp | string) {
  const comboboxes = screen.getAllByRole("combobox");
  await user.click(comboboxes[lineIndex * 2]);
  await user.click(await screen.findByRole("option", { name: optionName }));
}

describe("ManualJEModal (accounting 2-step)", () => {
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

  afterEach(() => {
    cleanup();
  });

  it("step 1 requires date before continuing to lines", async () => {
    const user = userEvent.setup();
    render(wrap(<ManualJEModal open operatingCompanyId={companyId} onClose={vi.fn()} onSaved={vi.fn()} />));

    const continueBtn = screen.getByRole("button", { name: /Continue to Lines/i });
    expect(continueBtn).not.toBeDisabled();

    await user.clear(screen.getByLabelText(/^Journal date$/i));
    expect(continueBtn).toBeDisabled();
  });

  it("step 2 keeps Save disabled until debits equal credits", async () => {
    const user = userEvent.setup();
    render(wrap(<ManualJEModal open operatingCompanyId={companyId} onClose={vi.fn()} onSaved={vi.fn()} />));

    await user.click(screen.getByRole("button", { name: /Continue to Lines/i }));

    await waitFor(() => expect(accountingApi.listCoaAccountsForJe).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByRole("combobox").length).toBeGreaterThanOrEqual(4));

    expect(screen.getByRole("button", { name: /Save journal entry/i })).toBeDisabled();

    const debitBoxes = screen.getAllByPlaceholderText("Debit");
    const creditBoxes = screen.getAllByPlaceholderText("Credit");

    await selectAccount(user, 0, /1000 - Cash/);
    await user.clear(debitBoxes[0]);
    await user.type(debitBoxes[0], "100");
    await selectAccount(user, 1, /2000 - A\/P/);
    await user.clear(creditBoxes[1]);
    await user.type(creditBoxes[1], "50");

    expect(screen.getByRole("button", { name: /Save journal entry/i })).toBeDisabled();

    await user.clear(creditBoxes[1]);
    await user.type(creditBoxes[1], "100");
    expect(screen.getByRole("button", { name: /Save journal entry/i })).not.toBeDisabled();
  });

  it("posts balanced entry with header fields via createJournalEntry", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(wrap(<ManualJEModal open operatingCompanyId={companyId} onClose={vi.fn()} onSaved={onSaved} />));

    await user.type(screen.getByLabelText(/^Reference number/i), "JE-2026-001");
    await user.type(screen.getByLabelText(/^Memo$/i), "Month-end true-up");
    await user.click(screen.getByRole("button", { name: /Continue to Lines/i }));

    await waitFor(() => expect(screen.getAllByRole("combobox").length).toBeGreaterThanOrEqual(4));

    const debitBoxes = screen.getAllByPlaceholderText("Debit");
    const creditBoxes = screen.getAllByPlaceholderText("Credit");

    await selectAccount(user, 0, /1000 - Cash/);
    await user.clear(debitBoxes[0]);
    await user.type(debitBoxes[0], "75");
    await selectAccount(user, 1, /2000 - A\/P/);
    await user.clear(creditBoxes[1]);
    await user.type(creditBoxes[1], "75");

    await user.click(screen.getByRole("button", { name: /Save journal entry/i }));

    await waitFor(() => expect(accountingApi.createJournalEntry).toHaveBeenCalledTimes(1));
    expect(accountingApi.createJournalEntry).toHaveBeenCalledWith(
      companyId,
      expect.objectContaining({
        source: "manual",
        memo: "Month-end true-up",
        reference_number: "JE-2026-001",
        postings: expect.arrayContaining([
          expect.objectContaining({ debit_or_credit: "debit", amount_cents: 7500 }),
          expect.objectContaining({ debit_or_credit: "credit", amount_cents: 7500 }),
        ]),
      })
    );
    expect(onSaved).toHaveBeenCalled();
  });
});
