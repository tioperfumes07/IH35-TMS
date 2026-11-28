import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeJournalPanel } from "../PerfumeJournalPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// ROUND L.31 M12 + M17: owner contribution = Dr bank / Cr 3000 through the one journal entry writer, ScentsX company, balanced.
const acct = (id: string, n: string, name: string) => ({ id, account_number: n, account_name: name, account_type: "x", account_subtype: null, roles: [], debit_cents: "0", credit_cents: "0" });
const posts: unknown[] = [];
beforeEach(() => {
  posts.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (path === "/api/v1/scentsx/company") return { company: { id: "sx1", code: "SCENTSX", legal_name: "ScentsX LLC", short_name: null, company_type: "llc", tax_id: null, accounts: 3, roles: 0, periods: 0, customers_linked: 0, vendors_linked: 0 } };
    if (path === "/api/v1/scentsx/accounts") return { accounts: [acct("b1", "1000", "Operating Checking"), acct("b2", "1010", "Store Cash Registers"), acct("e1", "3000", "Owner's Capital / Contributions"), acct("e2", "3100", "Owner's Draws"), acct("l1", "2400", "Loans from Owner")] };
    if (path.startsWith("/api/v1/accounting/journal-entries") && opts?.method === "POST") { posts.push(opts.body); return { id: "je1" }; }
    if (path.startsWith("/api/v1/accounting/journal-entries")) return { journal_entries: [] };
    throw new Error(`unexpected ${path}`);
  });
});
const mount = () => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><PerfumeJournalPanel /></ToastProvider></QueryClientProvider></MemoryRouter>);

describe("ScentsX journal entries", () => {
  it("Owner contribution posts Dr 1000 / Cr 3000 for the amount, ScentsX company", async () => {
    mount();
    const b = await screen.findByTestId("scentsx-je-contribution"); await waitFor(() => expect((b as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(b);
    const amt = await screen.findByLabelText("Amount");
    fireEvent.change(amt, { target: { value: "5000.00" } });
    fireEvent.blur(amt);
    await waitFor(() => expect(screen.getByTestId("scentsx-je-totals").textContent).toMatch(/Debits \$5,000\.00 · Credits \$5,000\.00/));
    fireEvent.click(screen.getByTestId("scentsx-je-save"));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ operating_company_id: "sx1", source: "manual", memo: "Owner contribution",
      postings: [{ account_id: "b1", debit_or_credit: "debit", amount_cents: 500000 }, { account_id: "e1", debit_or_credit: "credit", amount_cents: 500000 }] });
  });
  it("a blank entry cannot be saved until debits = credits", async () => {
    mount();
    const n = await screen.findByTestId("scentsx-je-new"); await waitFor(() => expect((n as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(n);
    fireEvent.change(await screen.findByTestId("scentsx-je-acct-0"), { target: { value: "b1" } });
    fireEvent.change(screen.getByTestId("scentsx-je-acct-1"), { target: { value: "e2" } });
    const a0 = screen.getByLabelText("Amount line 1"); fireEvent.change(a0, { target: { value: "10.00" } }); fireEvent.blur(a0);
    const a1 = screen.getByLabelText("Amount line 2"); fireEvent.change(a1, { target: { value: "9.00" } }); fireEvent.blur(a1);
    await waitFor(() => expect(screen.getByTestId("scentsx-je-totals").textContent).toMatch(/off by \$1\.00/));
    expect((screen.getByTestId("scentsx-je-save") as HTMLButtonElement).disabled).toBe(true);
  });
});
