import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeBankingPanel } from "../PerfumeBankingPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));
vi.mock("../../banking/RecordTransferModal", () => ({ RecordTransferModal: (p: { operatingCompanyId: string; defaultTransferType: string }) => <div data-testid="transfer-modal">{`${p.operatingCompanyId}:${p.defaultTransferType}`}</div> }));

// ROUND L.31 M10: ScentsX banking — book balances from its ledger, transfers through the one engine, QuickBooks reconcile on the one engine.
const calls: Array<[string, unknown]> = [];
let variance = 5000;
let cleared = false;
beforeEach(() => {
  calls.length = 0; variance = 5000; cleared = false;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method) {
      calls.push([path, opts.body]);
      if (path === "/api/v1/banking/reconciliation/start") return { session_id: "s1" };
      if (path.includes("/clear?")) { cleared = true; variance = 0; return { ok: true }; }
      return { ok: true };
    }
    if (path === "/api/v1/scentsx/company") return { company: { id: "sx1", code: "SCENTSX", legal_name: "ScentsX LLC" } };
    if (path.startsWith("/api/v1/banking/accounts/all?operating_company_id=sx1")) return { accounts: [
      { id: "b1", account_name: "Operating Checking", account_type: "checking", ledger_account_id: "l1000" },
      { id: "b4", account_name: "Business Credit Card", account_type: "credit_card", ledger_account_id: "l2010" }] };
    if (path === "/api/v1/scentsx/accounts") return { accounts: [
      { id: "l1000", account_number: "1000", account_name: "Operating Checking", account_type: "Bank", account_subtype: null, roles: [], debit_cents: "1000000", credit_cents: "250000" },
      { id: "l2010", account_number: "2010", account_name: "Business Credit Card", account_type: "Liability", account_subtype: null, roles: [], debit_cents: "10000", credit_cents: "60000" }] };
    if (path.startsWith("/api/v1/banking/transfers?operating_company_id=sx1")) return { transfers: [{ id: "t1", operating_company_id: "sx1", transfer_type: "bank_to_bank", from_account_id: "b1", from_account_kind: "bank",
      to_account_id: "b4", to_account_kind: "bank", amount_cents: 20000, transfer_date: "2026-11-20", memo: "Move", reference_number: null, qbo_journal_entry_id: null, revoked_at: null }] };
    if (path.startsWith("/api/v1/banking/reconciliation/sessions")) return { open_sessions: [], completed_sessions: [] };
    if (path.startsWith("/api/v1/banking/reconciliation/s1?operating_company_id=sx1")) return { session: { id: "s1", bank_account_id: "b1", period_start: "2026-11-01", period_end: "2026-11-27", statement_balance_cents: 750000, status: "open" },
      bank_account_label: "Operating Checking", matched_transactions: [], unmatched_transactions: [], candidates: { loads: [], bills: [], settlements: [] },
      summary: { statement_balance_cents: 750000, beginning_balance_cents: 0, matched_credits_cents: 0, matched_debits_cents: 0, book_balance_cents: 750000, variance_cents: variance },
      gl_lines: [{ posting_id: "p1", journal_entry_id: "j1", entry_date: "2026-11-05", amount_cents: 5000, is_credit: false, memo: "Fee", description: null, type_label: "Check", source_transaction_type: null, register_cleared: cleared, ref: "101", payee: "Bank", split_account: null }] };
    throw new Error(`unexpected ${path}`);
  });
});
const mount = () => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><PerfumeBankingPanel /></ToastProvider></QueryClientProvider></MemoryRouter>);

describe("ScentsX banking", () => {
  it("book balance from ScentsX's ledger (checking = Dr − Cr; card owed = Cr − Dr); transfers open the one engine for ScentsX", async () => {
    mount();
    expect((await screen.findAllByText("$7,500.00")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("$500.00").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId("scentsx-bk-ccpay"));
    expect(screen.getByTestId("transfer-modal").textContent).toBe("sx1:cc_payment");
  });
  it("reconcile: start with the statement balance, tick a cleared line, Finish only at $0.00 difference", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("scentsx-bk-reconcile-b1"));
    const bal = await screen.findByLabelText("Statement ending balance"); fireEvent.change(bal, { target: { value: "7500.00" } }); fireEvent.blur(bal);
    await waitFor(() => expect((screen.getByTestId("scentsx-bk-start") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("scentsx-bk-start"));
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/banking/reconciliation/start", expect.objectContaining({ bank_account_id: "b1", statement_balance_cents: 750000 })]));
    const finish = await screen.findByTestId("scentsx-bk-finish");
    expect((finish as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(await screen.findByTestId("scentsx-bk-clear-p1"));
    await waitFor(() => expect(calls.some(([p, b]) => p.includes("/reconciliation/s1/clear?operating_company_id=sx1") && (b as { posting_id: string; cleared: boolean }).posting_id === "p1")).toBe(true));
    await waitFor(() => expect((screen.getByTestId("scentsx-bk-finish") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("scentsx-bk-finish"));
    await waitFor(() => expect(calls.some(([p]) => p.includes("/reconciliation/s1/complete?operating_company_id=sx1"))).toBe(true));
  });
  it("reverse a transfer needs a reason", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("scentsx-bk-revoke-t1"));
    const ok = await screen.findByTestId("scentsx-bk-revoke-confirm");
    expect((ok as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("scentsx-bk-revoke-reason"), { target: { value: "Wrong account" } });
    fireEvent.click(ok);
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/banking/transfers/t1/revoke?operating_company_id=sx1", { reason: "Wrong account" }]));
  });
});
