import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { ScentsxDepositsPanel } from "../ScentsxDepositsPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// ROUND L.31 M7 (CC2, fixed by LEAD): the deposit goes to a banking.bank_accounts id (the engine's key), only checking / savings offered.
const posts: Array<[string, unknown]> = [];
beforeEach(() => {
  posts.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method === "POST") { posts.push([path, opts.body]); return { deposit: { id: "d1", display_id: "DEP-1", journal_entry_id: "j1", total_receipts_cents: 15000, cash_back_cents: 0, amount_deposited_cents: 15000 } }; }
    if (path === "/api/v1/scentsx/company") return { company: { id: "sx1", code: "SCENTSX", legal_name: "ScentsX LLC" } };
    if (path.startsWith("/api/v1/accounting/bank-deposits/undeposited")) return { rows: [{ kind: "customer_payment", id: "p1", display_id: "PMT-1", amount_cents: 15000, receipt_date: "2026-11-27", payee_name: "Perfumes El Sol" }], count: 1 };
    if (path.startsWith("/api/v1/accounting/bank-deposits?")) return { rows: [], count: 0 };
    if (path.startsWith("/api/v1/banking/accounts/all?operating_company_id=sx1")) return { accounts: [
      { id: "bank-1000", account_name: "Operating Checking", account_type: "checking", ledger_account_id: "l1000" },
      { id: "bank-1010", account_name: "Store Cash Registers", account_type: "cash_on_hand", ledger_account_id: "l1010" },
      { id: "bank-2010", account_name: "Business Credit Card", account_type: "credit_card", ledger_account_id: "l2010" }] };
    throw new Error(`unexpected ${path}`);
  });
});

describe("ScentsX bank deposits", () => {
  it("deposits the ticked receipt into Operating Checking by its bank-account id; cash registers / card are not deposit targets", async () => {
    render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><ScentsxDepositsPanel /></ToastProvider></QueryClientProvider></MemoryRouter>);
    expect(await screen.findByText("Perfumes El Sol")).toBeTruthy();
    fireEvent.click(screen.getAllByLabelText("Select row")[0]!);
    const sel = (await screen.findByTestId("scentsx-deposit-bank")) as HTMLSelectElement;
    await waitFor(() => expect([...sel.options].map((o) => o.value)).toEqual(["bank-1000"]));
    fireEvent.click(screen.getByTestId("scentsx-deposit-save"));
    await waitFor(() => expect(posts).toContainEqual(["/api/v1/accounting/bank-deposits", expect.objectContaining({ operating_company_id: "sx1", bank_account_id: "bank-1000", payment_ids: ["p1"] })]));
  });
});
