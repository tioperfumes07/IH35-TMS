import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { ScentsxDailyReportPanel } from "../ScentsxDailyReportPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// ROUND L.31 M8 — the day's posted transactions from the books + the drawer count on a cash register only.
const posts: Array<[string, unknown]> = [];
beforeEach(() => {
  posts.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method === "POST") { posts.push([path, opts.body]); return { date: "2026-11-27", register: { bank_account_id: "b3", name: "Store Cash Registers" }, counted_cents: 9950, book_cents: 10000, variance_cents: -50, direction: "short", journal_entry_id: "je9" }; }
    if (path.startsWith("/api/v1/scentsx/daily-report?")) return { date: "2026-11-27", by_type: [], totals: { entries: 2, sales_cents: 10000, cash_in_cents: 10000, cash_out_cents: 0 },
      entries: [{ journal_entry_id: "j1", source_transaction_type: "invoice", source_transaction_id: "i1", memo: "Invoice INV-1 posting", amount_cents: 10000 },
        { journal_entry_id: "j2", source_transaction_type: "customer_payment", source_transaction_id: "p1", memo: "Payment PMT-1", amount_cents: 10000 }] };
    if (path === "/api/v1/scentsx/company") return { company: { id: "sx1", code: "SCENTSX", legal_name: "ScentsX LLC" } };
    if (path.startsWith("/api/v1/banking/accounts/all?")) return { accounts: [{ id: "b1", account_name: "Operating Checking", account_type: "checking", ledger_account_id: "l1" },
      { id: "b3", account_name: "Store Cash Registers", account_type: "cash_on_hand", ledger_account_id: "l3" }] };
    throw new Error(`unexpected ${path}`);
  });
});

describe("ScentsX day + drawer count", () => {
  it("shows what posted and counts the drawer on a cash register", async () => {
    render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><ScentsxDailyReportPanel /></ToastProvider></QueryClientProvider></MemoryRouter>);
    expect(await screen.findByText("Invoice INV-1 posting")).toBeTruthy();
    expect(screen.getByText("customer payment")).toBeTruthy();
    fireEvent.click(screen.getByTestId("scentsx-day-count"));
    const reg = await screen.findByTestId("scentsx-day-register");
    await waitFor(() => expect(Array.from((reg as HTMLSelectElement).options).map((o) => o.value)).toEqual(["b3"]));
    const amt = screen.getByLabelText("Cash counted"); fireEvent.change(amt, { target: { value: "99.50" } }); fireEvent.blur(amt);
    await waitFor(() => expect((screen.getByTestId("scentsx-day-count-save") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("scentsx-day-count-save"));
    await waitFor(() => expect(posts).toEqual([["/api/v1/scentsx/drawer-count", { date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), counted_cents: 9950, bank_account_id: "b3" }]]));
  });
});
