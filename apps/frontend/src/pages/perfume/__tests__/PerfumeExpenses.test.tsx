import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeExpensesPanel } from "../PerfumeExpensesPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// ROUND L.31 M5: a ScentsX expense = an expense item (its account) paid from a bank / cash / card ledger account, through the one writer.
const posts: Array<[string, unknown]> = [];
beforeEach(() => {
  posts.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method === "POST") { posts.push([path, opts.body]); return { expense_id: "e1", posting_status: "posted", journal_entry_id: "j1" }; }
    if (path === "/api/v1/scentsx/company") return { company: { id: "sx1", code: "SCENTSX", legal_name: "ScentsX LLC" } };
    if (path.startsWith("/api/v1/expenses")) return { rows: [] };
    if (path.startsWith("/api/v1/catalogs/items?operating_company_id=sx1&search=EXP-")) return { items: [
      { id: "it-rent", item_name: "Rent - warehouse & store", item_code: "EXP-RENT", default_expense_account_id: "a6000" },
      { id: "it-cardfee", item_name: "Card processing fees", item_code: "EXP-CARD_FEES", default_expense_account_id: "a6100" }] };
    if (path.startsWith("/api/v1/banking/accounts/all?operating_company_id=sx1")) return { accounts: [
      { id: "bank-1000", account_name: "Operating Checking", account_type: "checking", ledger_account_id: "l1000" },
      { id: "bank-2010", account_name: "Business Credit Card", account_type: "credit_card", ledger_account_id: "l2010" }] };
    throw new Error(`unexpected ${path}`);
  });
});

describe("ScentsX expenses", () => {
  it("a card charge for rent: Dr the rent item's account, paid from the card's ledger account, with the item named, no unit", async () => {
    render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><PerfumeExpensesPanel /></ToastProvider></QueryClientProvider></MemoryRouter>);
    await waitFor(() => expect((screen.getByTestId("scentsx-ex-new") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("scentsx-ex-new"));
    await screen.findByText("Rent - warehouse & store");
    fireEvent.change(screen.getByTestId("scentsx-ex-item"), { target: { value: "it-rent" } });
    const amt = screen.getByLabelText("Expense amount"); fireEvent.change(amt, { target: { value: "1200.00" } }); fireEvent.blur(amt);
    await screen.findByText(/Business Credit Card \(card charge\)/);
    fireEvent.change(screen.getByTestId("scentsx-ex-from"), { target: { value: "bank-2010" } });
    await waitFor(() => expect((screen.getByTestId("scentsx-ex-save") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("scentsx-ex-save"));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]![0]).toMatch(/^\/api\/v1\/expenses/);
    expect(posts[0]![1]).toMatchObject({ item_id: "it-rent", category_account_id: "a6000", amount_cents: 120000, payment_account_uuid: "l2010", is_company_expense: true });
    expect(posts[0]![1]).not.toHaveProperty("unit_id");
  });
});
