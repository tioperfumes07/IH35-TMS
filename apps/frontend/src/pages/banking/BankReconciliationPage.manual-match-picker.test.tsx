// @vitest-environment jsdom
// P23-BANKING-RAW-UUID-BACKEND-GAPS — the manual-match panel used to take a raw pasted uuid because
// no unreconciled-only, bank-txn-comparable list endpoint covered all four kinds
// (verify-picker-law-no-raw-uuid.mjs's own former exemption on `manualLedgerId`). It now reuses the
// existing getMatchCandidates endpoint (already live for MatchDrawer) as a real search picker. This
// asserts the picker is wired end to end: no raw uuid input remains, a search calls the API, picking
// a candidate sets the committed id, and Manual match submits that id.
import * as matchers from "@testing-library/jest-dom/matchers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as bankingApi from "../../api/banking";
import type { BankMatchCandidate } from "../../api/banking";
import { ToastProvider } from "../../components/Toast";
import { BankReconciliationPage } from "./BankReconciliationPage";

expect.extend(matchers);

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
const bankTxnId = "b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../api/banking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/banking")>();
  return {
    ...actual,
    getPlaidBankAccounts: vi.fn().mockResolvedValue({ accounts: [{ id: "acct-1", name: "Checking" }] }),
    getCoaAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
    getReconciliationSessions: vi.fn().mockResolvedValue({ completed_sessions: [], open_sessions: [] }),
    getBankReconWorklist: vi.fn().mockResolvedValue({
      unmatched_transactions: [
        {
          id: "b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
          amount_cents: 15000,
          transaction_date: "2026-06-30",
          description: "Fuel station",
          merchant_name: "Fuel station",
        },
      ],
      auto_matched_candidates: [],
      variance_resolved_entries: [],
      progress: { percent: 0, matched_or_skipped_transactions: 0, total_transactions: 1 },
    }),
    getMatchCandidates: vi.fn(),
    manualBankReconMatch: vi.fn().mockResolvedValue({ ok: true }),
  };
});

function candidate(overrides: Partial<BankMatchCandidate>): BankMatchCandidate {
  return {
    ledger_entry_kind: "payment",
    ledger_entry_id: "pay-1a2b3c4d",
    amount_cents: 15000,
    event_date: "2026-06-29",
    memo: "ACME Freight",
    amount_gap_cents: 0,
    date_gap_days: 1,
    memo_similarity: 0.8,
    match_score: 0.9,
    auto_match: false,
    ...overrides,
  };
}

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter initialEntries={["/banking/reconcile?account_id=acct-1&period_start=2026-06-01&period_end=2026-06-30"]}>
      <QueryClientProvider client={qc}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("BankReconciliationPage manual-match picker (P23-BANKING-RAW-UUID-BACKEND-GAPS)", () => {
  beforeEach(() => {
    vi.mocked(bankingApi.getMatchCandidates).mockReset();
    vi.mocked(bankingApi.manualBankReconMatch).mockReset().mockResolvedValue({ ok: true } as never);
  });

  it("never renders a raw ledger-entry-id text input", async () => {
    vi.mocked(bankingApi.getMatchCandidates).mockResolvedValue({ candidates: [], match_candidates_count: 0 });
    render(wrap(<BankReconciliationPage />));

    await screen.findByText("Fuel station");
    expect(screen.queryByPlaceholderText(/ledger entry id.*uuid/i)).not.toBeInTheDocument();
  });

  it("selecting a bank line searches candidates, and picking one wires the id into Manual match", async () => {
    const user = userEvent.setup();
    vi.mocked(bankingApi.getMatchCandidates).mockResolvedValue({
      candidates: [candidate({ ledger_entry_id: "pay-exact-1", memo: "ACME Freight" })],
      match_candidates_count: 1,
    });

    render(wrap(<BankReconciliationPage />));

    await user.click(await screen.findByText("Fuel station"));

    await waitFor(() => expect(bankingApi.getMatchCandidates).toHaveBeenCalledWith(bankTxnId, companyId, expect.any(Object)));

    const search = await screen.findByPlaceholderText(/search unreconciled entries/i);
    await user.click(search);
    expect(await screen.findByText(/ACME Freight/)).toBeInTheDocument();

    await user.click(screen.getByText(/ACME Freight/));

    const manualMatchBtn = screen.getByRole("button", { name: /manual match/i });
    expect(manualMatchBtn).toBeEnabled();

    await user.click(manualMatchBtn);

    await waitFor(() =>
      expect(bankingApi.manualBankReconMatch).toHaveBeenCalledWith(
        expect.objectContaining({
          operating_company_id: companyId,
          bank_transaction_id: bankTxnId,
          ledger_entry_kind: "payment",
          ledger_entry_id: "pay-exact-1",
        })
      )
    );
  });

  it("switching the kind selector clears a previously-picked candidate id", async () => {
    const user = userEvent.setup();
    vi.mocked(bankingApi.getMatchCandidates).mockResolvedValue({
      candidates: [candidate({ ledger_entry_id: "pay-exact-1", memo: "ACME Freight" })],
      match_candidates_count: 1,
    });

    render(wrap(<BankReconciliationPage />));
    await user.click(await screen.findByText("Fuel station"));

    const search = await screen.findByPlaceholderText(/search unreconciled entries/i);
    await user.click(search);
    await user.click(await screen.findByText(/ACME Freight/));
    expect(screen.getByRole("button", { name: /manual match/i })).toBeEnabled();

    // SelectCombobox is built on the same Combobox primitive as the picker, not a native <select> —
    // open it and click the option, rather than user.selectOptions (which targets a real <select>).
    const kindSelect = screen.getByDisplayValue("payment");
    await user.click(kindSelect);
    await user.click(await screen.findByText("transfer"));

    expect(screen.getByRole("button", { name: /manual match/i })).toBeDisabled();
  });
});
