// @vitest-environment jsdom
// BANKREC-CONFIRM-01 + ROUND 206 Resolve — exact Confirm always; variance Confirm when write-off
// account selected; bill stays held.
import * as matchers from "@testing-library/jest-dom/matchers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as bankingApi from "../../../api/banking";
import type { BankMatchCandidate } from "../../../api/banking";
import { ToastProvider } from "../../../components/Toast";
import { MatchDrawer } from "./MatchDrawer";

expect.extend(matchers);

vi.mock("../../../api/banking", async (importOriginal) => {
  const actual = await importOriginal<typeof bankingApi>();
  return {
    ...actual,
    getMatchCandidates: vi.fn(),
    acceptBankReconMatch: vi.fn(),
    acceptBankReconMultiMatch: vi.fn(),
    getCoaAccounts: vi.fn().mockResolvedValue({
      accounts: [
        {
          id: "wo-acct-1",
          account_number: "6400",
          account_name: "Factoring Fees",
          account_type: "Expense",
        },
        {
          id: "wo-acct-1235",
          account_number: "1235",
          account_name: "Faro Cash Reserve",
          account_type: "Asset",
        },
      ],
    }),
    categorizeBankTransaction: vi.fn(),
  };
});

vi.mock("../../../api/mdata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/mdata")>();
  return {
    ...actual,
    listVendors: vi.fn().mockResolvedValue({ vendors: [] }),
  };
});

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
const bankTxnId = "b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

function candidate(overrides: Partial<BankMatchCandidate>): BankMatchCandidate {
  return {
    ledger_entry_kind: "expense",
    ledger_entry_id: "e1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    amount_cents: 15000,
    event_date: "2026-06-30",
    memo: "Fuel purchase",
    amount_gap_cents: 0,
    date_gap_days: 0,
    memo_similarity: 1,
    match_score: 0.99,
    auto_match: false,
    ...overrides,
  };
}

describe("MatchDrawer — Confirm-match exact-only (BANKREC-CONFIRM-01)", () => {
  beforeEach(() => {
    vi.mocked(bankingApi.acceptBankReconMatch).mockReset();
    vi.mocked(bankingApi.getMatchCandidates).mockReset();
  });

  it("enables Confirm for a gap=0 expense candidate and calls acceptBankReconMatch with kind+id on click", async () => {
    const expenseCandidate = candidate({
      ledger_entry_kind: "expense",
      ledger_entry_id: "exp-exact-1",
      amount_gap_cents: 0,
    });
    vi.mocked(bankingApi.getMatchCandidates).mockResolvedValue({
      candidates: [expenseCandidate],
      match_candidates_count: 1,
    });
    vi.mocked(bankingApi.acceptBankReconMatch).mockResolvedValue({ ok: true, result: {} });

    render(wrap(<MatchDrawer open bankTransactionId={bankTxnId} operatingCompanyId={companyId} onClose={vi.fn()} />));

    const row = await screen.findByTestId("match-candidate-row");
    const confirmBtn = within(row).getByTestId("match-candidate-confirm");
    await waitFor(() => expect(confirmBtn).not.toBeDisabled());

    await userEvent.click(confirmBtn);

    await waitFor(() => expect(bankingApi.acceptBankReconMatch).toHaveBeenCalledTimes(1));
    expect(bankingApi.acceptBankReconMatch).toHaveBeenCalledWith({
      operating_company_id: companyId,
      bank_transaction_id: bankTxnId,
      ledger_entry_kind: "expense",
      ledger_entry_id: "exp-exact-1",
    });
  });

  it("keeps Confirm disabled for a gap!==0 candidate until write-off account is selected", async () => {
    const varianceCandidate = candidate({
      ledger_entry_kind: "payment",
      ledger_entry_id: "pay-variance-1",
      amount_gap_cents: 500,
    });
    vi.mocked(bankingApi.getMatchCandidates).mockResolvedValue({
      candidates: [varianceCandidate],
      match_candidates_count: 1,
      bank_amount_cents: 10500,
    });

    render(wrap(<MatchDrawer open bankTransactionId={bankTxnId} operatingCompanyId={companyId} onClose={vi.fn()} />));

    const row = await screen.findByTestId("match-candidate-row");
    const confirmBtn = within(row).getByTestId("match-candidate-confirm");
    expect(confirmBtn).toBeDisabled();
    expect(within(row).getByTestId("match-candidate-variance-held")).toHaveTextContent(
      "Select a write-off / difference account to resolve this variance"
    );

    await userEvent.click(confirmBtn);
    expect(bankingApi.acceptBankReconMatch).not.toHaveBeenCalled();
  });

  it("named Resolve quick-pick (Reserve Deposit) sets write-off and unlocks variance Confirm", async () => {
    const varianceCandidate = candidate({
      ledger_entry_kind: "payment",
      ledger_entry_id: "pay-variance-named-1",
      amount_gap_cents: 180000,
    });
    vi.mocked(bankingApi.getMatchCandidates).mockResolvedValue({
      candidates: [varianceCandidate],
      match_candidates_count: 1,
      bank_amount_cents: 367050,
    });
    vi.mocked(bankingApi.acceptBankReconMatch).mockResolvedValue({ ok: true } as never);

    render(wrap(<MatchDrawer open bankTransactionId={bankTxnId} operatingCompanyId={companyId} onClose={vi.fn()} />));

    const named = await screen.findByTestId("match-named-resolve-reserve-deposit");
    await waitFor(() => expect(named).toBeEnabled());
    await userEvent.click(named);

    const row = await screen.findByTestId("match-candidate-row");
    const confirmBtn = within(row).getByTestId("match-candidate-confirm");
    expect(confirmBtn).toBeEnabled();
    await userEvent.click(confirmBtn);
    await waitFor(() => {
      expect(bankingApi.acceptBankReconMatch).toHaveBeenCalledWith(
        expect.objectContaining({
          variance_account_id: "wo-acct-1235",
          ledger_entry_id: "pay-variance-named-1",
        }),
      );
    });
  });

  it("keeps Confirm disabled for a bill candidate with the CHAIN-04 note, even at gap=0", async () => {
    const billCandidate = candidate({
      ledger_entry_kind: "bill",
      ledger_entry_id: "bill-exact-1",
      amount_gap_cents: 0,
    });
    vi.mocked(bankingApi.getMatchCandidates).mockResolvedValue({
      candidates: [billCandidate],
      match_candidates_count: 1,
    });

    render(wrap(<MatchDrawer open bankTransactionId={bankTxnId} operatingCompanyId={companyId} onClose={vi.fn()} />));

    const row = await screen.findByTestId("match-candidate-row");
    const confirmBtn = within(row).getByTestId("match-candidate-confirm");
    expect(confirmBtn).toBeDisabled();
    expect(within(row).getByText("Posting available after CHAIN-04")).toBeInTheDocument();

    await userEvent.click(confirmBtn);
    expect(bankingApi.acceptBankReconMatch).not.toHaveBeenCalled();
  });
  it("FAIL-BM1: clicking the candidate row SELECTS it — the primary click must not be the drill-through", async () => {
    // The row previously had no click handler at all: selection was only reachable via the small radio,
    // while the most prominent clickable element was the EntityLink to the expense/bill. The natural click
    // therefore navigated AWAY from the match the user was making and closed the drawer with nothing matched
    // — which is what blocked the bank-match walk.
    const c1 = candidate({ ledger_entry_id: "cand-1", amount_gap_cents: 0 });
    vi.mocked(bankingApi.getMatchCandidates).mockResolvedValue({ candidates: [c1], match_candidates_count: 1 });

    render(wrap(<MatchDrawer open bankTransactionId={bankTxnId} operatingCompanyId={companyId} onClose={vi.fn()} />));

    const row = await screen.findByTestId("match-candidate-row");
    const radio = within(row).getByTestId("match-candidate-select") as HTMLInputElement;
    expect(radio.checked).toBe(false);

    // Click the row body, deliberately NOT the radio and NOT the link.
    await userEvent.click(within(row).getByTestId("match-candidate-amount"));
    expect(radio.checked).toBe(true);
  });

  it("FAIL-BM1: the drill-through link does NOT also change the selection", async () => {
    const c1 = candidate({ ledger_entry_id: "cand-1", amount_gap_cents: 0 });
    vi.mocked(bankingApi.getMatchCandidates).mockResolvedValue({ candidates: [c1], match_candidates_count: 1 });

    render(wrap(<MatchDrawer open bankTransactionId={bankTxnId} operatingCompanyId={companyId} onClose={vi.fn()} />));

    const row = await screen.findByTestId("match-candidate-row");
    const radio = within(row).getByTestId("match-candidate-select") as HTMLInputElement;

    await userEvent.click(within(row).getByTestId("match-candidate-drillthrough"));
    // Navigating must not silently select on the way out.
    expect(radio.checked).toBe(false);
  });
});

describe("MatchDrawer — ROUND 207 date cascade UI", () => {
  beforeEach(() => {
    vi.mocked(bankingApi.getMatchCandidates).mockReset();
  });

  it("shows Within 3 days header and Search 7 days when step-1 has candidates", async () => {
    vi.mocked(bankingApi.getMatchCandidates).mockResolvedValue({
      candidates: [candidate({ amount_gap_cents: 0 })],
      match_candidates_count: 1,
      window: { step: 1, from: "2026-09-02", to: "2026-09-06", auto_widened: false },
    });
    render(wrap(<MatchDrawer open bankTransactionId={bankTxnId} operatingCompanyId={companyId} onClose={vi.fn()} />));
    await waitFor(() => {
      expect(screen.getByTestId("match-window-header")).toHaveTextContent(/Within 3 days/);
    });
    expect(screen.getByTestId("match-search-7-days")).toBeInTheDocument();
    expect(screen.queryByTestId("match-window-widened-banner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("match-search-all")).not.toBeInTheDocument();
  });

  it("shows widened banner when auto_widened", async () => {
    vi.mocked(bankingApi.getMatchCandidates).mockResolvedValue({
      candidates: [candidate({ amount_gap_cents: 0 })],
      match_candidates_count: 1,
      window: { step: 2, from: "2026-08-29", to: "2026-09-07", auto_widened: true },
    });
    render(wrap(<MatchDrawer open bankTransactionId={bankTxnId} operatingCompanyId={companyId} onClose={vi.fn()} />));
    await waitFor(() => {
      expect(screen.getByTestId("match-window-widened-banner")).toHaveTextContent(
        "No candidates within 3 days — widened to 7 days.",
      );
    });
    expect(screen.queryByTestId("match-search-7-days")).not.toBeInTheDocument();
  });

  it("shows From/To when step-2 returns empty", async () => {
    vi.mocked(bankingApi.getMatchCandidates).mockResolvedValue({
      candidates: [],
      match_candidates_count: 0,
      window: { step: 2, from: "2026-08-29", to: "2026-09-07", auto_widened: true },
    });
    render(wrap(<MatchDrawer open bankTransactionId={bankTxnId} operatingCompanyId={companyId} onClose={vi.fn()} />));
    expect(await screen.findByTestId("match-from-to")).toBeInTheDocument();
    expect(screen.getByTestId("match-date-from")).toBeInTheDocument();
    expect(screen.getByTestId("match-date-to")).toBeInTheDocument();
  });
});

describe("MatchDrawer — B-3 §19 ±90 day default", () => {
  beforeEach(() => {
    vi.mocked(bankingApi.getMatchCandidates).mockReset();
  });

  it("seeds From/To to bank date ±90 days and labels the header", async () => {
    vi.mocked(bankingApi.getMatchCandidates).mockResolvedValue({
      candidates: [candidate({ amount_gap_cents: 0 })],
      match_candidates_count: 1,
      window: { step: "custom", from: "2026-06-07", to: "2026-12-04", auto_widened: false },
      bank_amount_cents: 10000,
    });
    render(
      wrap(
        <MatchDrawer
          open
          bankTransactionId={bankTxnId}
          bankTransactionDate="2026-09-05"
          operatingCompanyId={companyId}
          onClose={vi.fn()}
        />
      )
    );
    await waitFor(() => {
      expect(screen.getByTestId("match-window-header")).toHaveTextContent(/±90 days/);
    });
    expect(screen.getByTestId("match-from-to")).toBeInTheDocument();
    expect(bankingApi.getMatchCandidates).toHaveBeenCalledWith(
      bankTxnId,
      companyId,
      expect.objectContaining({ dateFrom: "2026-06-07", dateTo: "2026-12-04" })
    );
  });
});

describe("MatchDrawer — B-3 §19 Suggested + Record type chips", () => {
  beforeEach(() => {
    vi.mocked(bankingApi.getMatchCandidates).mockReset();
  });

  it("filters to auto_match when Suggested is pressed", async () => {
    vi.mocked(bankingApi.getMatchCandidates).mockResolvedValue({
      candidates: [
        candidate({ ledger_entry_id: "sug-1", auto_match: true, memo: "Suggested fuel" }),
        candidate({ ledger_entry_id: "oth-1", auto_match: false, memo: "Other expense" }),
      ],
      match_candidates_count: 2,
      bank_amount_cents: 15000,
    });
    render(wrap(<MatchDrawer open bankTransactionId={bankTxnId} operatingCompanyId={companyId} onClose={vi.fn()} />));
    expect(await screen.findByTestId("match-drawer-filter-chips")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByTestId("match-candidate-row")).toHaveLength(2);
    });

    await userEvent.click(screen.getByTestId("match-chip-suggested"));
    await waitFor(() => {
      expect(screen.getAllByTestId("match-candidate-row")).toHaveLength(1);
    });
    expect(screen.getAllByText("Suggested fuel").length).toBeGreaterThan(0);
    expect(screen.queryByText("Other expense")).not.toBeInTheDocument();
  });

  it("passes kinds when a Record type chip is pressed", async () => {
    vi.mocked(bankingApi.getMatchCandidates).mockResolvedValue({
      candidates: [candidate({ ledger_entry_kind: "payment", amount_gap_cents: 0 })],
      match_candidates_count: 1,
      bank_amount_cents: 15000,
    });
    render(wrap(<MatchDrawer open bankTransactionId={bankTxnId} operatingCompanyId={companyId} onClose={vi.fn()} />));
    await screen.findByTestId("match-chip-record-payment");
    await userEvent.click(screen.getByTestId("match-chip-record-payment"));
    await waitFor(() => {
      expect(bankingApi.getMatchCandidates).toHaveBeenCalledWith(
        bankTxnId,
        companyId,
        expect.objectContaining({ kinds: ["payment"] })
      );
    });
  });
});
