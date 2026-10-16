// @vitest-environment jsdom
// LEAD 443.163 (register M3 + M5): the Categorize / Match popup embeds THIS matcher (no drawer chrome — one matcher on
// screen), and its QuickBooks Find-match filters Payee / Amount from / Amount to / types reach the candidate API.
// Fails on the old drawer: no `embedded` mode, no Payee / Amount filter controls, no payee / Difference / Days off fields.
import * as matchers from "@testing-library/jest-dom/matchers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as bankingApi from "../../../api/banking";
import { ToastProvider } from "../../../components/Toast";
import { MatchDrawer } from "./MatchDrawer";

expect.extend(matchers);

vi.mock("../../../api/banking", async (importOriginal) => {
  const actual = await importOriginal<typeof bankingApi>();
  return {
    ...actual,
    getMatchCandidates: vi.fn(),
    getCoaAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
  };
});
vi.mock("../../../api/mdata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/mdata")>();
  return { ...actual, listVendors: vi.fn().mockResolvedValue({ vendors: [] }) };
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

describe("MatchDrawer — the one matcher (443.163 M3 + M5)", () => {
  beforeEach(() => {
    vi.mocked(bankingApi.getMatchCandidates).mockReset();
    vi.mocked(bankingApi.getMatchCandidates).mockResolvedValue({
      candidates: [
        {
          ledger_entry_kind: "factoring_advance", ledger_entry_id: "a1", amount_cents: 532500, event_date: "2026-08-10",
          memo: "Faro purchase FP-2026-00009", reference: "FP-2026-00009", counterparty_name: "Faro Factoring",
          amount_gap_cents: 0, date_gap_days: 0, memo_similarity: 0.6, match_score: 0.99, auto_match: false, open_balance_cents: null,
        },
      ],
      match_candidates_count: 1,
      bank_amount_cents: 532500,
    } as never);
  });

  it("renders embedded (no drawer chrome) with payee, Difference and Days off on each row", async () => {
    render(wrap(
      <MatchDrawer embedded open bankTransactionId="bt-1" bankTransactionDate="2026-08-10" operatingCompanyId="co-1" onClose={() => {}} />
    ));
    expect(await screen.findByTestId("match-drawer")).toHaveAttribute("data-embedded", "1");
    expect(await screen.findByTestId("match-candidate-payee")).toHaveTextContent("Faro Factoring");
    expect(screen.getByTestId("match-candidate-difference")).toHaveTextContent("Difference");
    expect(screen.getByTestId("match-candidate-days-off")).toHaveTextContent("Days off: 0");
  });

  it("sends Payee and Amount from / to to the candidate API", async () => {
    const user = userEvent.setup();
    render(wrap(
      <MatchDrawer embedded open bankTransactionId="bt-1" bankTransactionDate="2026-08-10" operatingCompanyId="co-1" onClose={() => {}} />
    ));
    await screen.findByTestId("match-filter-payee");
    await user.type(screen.getByTestId("match-filter-payee"), "Faro");
    await user.type(screen.getByTestId("match-filter-amount-min"), "5000");
    await user.type(screen.getByTestId("match-filter-amount-max"), "6000");
    await waitFor(() => {
      const calls = vi.mocked(bankingApi.getMatchCandidates).mock.calls;
      const last = calls[calls.length - 1]?.[2] as { payee?: string; amountMin?: number; amountMax?: number } | undefined;
      expect(last?.payee).toBe("Faro");
      expect(last?.amountMin).toBe(5000);
      expect(last?.amountMax).toBe(6000);
    });
  });
});
