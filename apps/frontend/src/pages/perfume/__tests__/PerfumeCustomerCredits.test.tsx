import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeCustomerCredits } from "../PerfumeCustomerCredits";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// ROUND L.31 M2 + M3: credit memos applied to invoices and bad-debt write-offs, all through the one credit-memo engine.
const posts: Array<[string, unknown]> = [];
const acc = (id: string, n: string, name: string, type: string) => ({ id, account_number: n, account_name: name, account_type: type, account_subtype: null, roles: [], debit_cents: "0", credit_cents: "0" });
beforeEach(() => {
  posts.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method === "POST") { posts.push([path, opts.body]); return { id: "cmN", display_id: "CM-2026-0002", applicationIds: ["a1"] }; }
    if (path.startsWith("/api/v1/accounting/credit-memos?")) return { credit_memos: [{ id: "cm1", customer_id: "cu1", display_id: "CM-2026-0001", status: "issued", reason: "damage",
      issue_date: "2026-11-20", amount_cents: 5000, amount_applied_cents: 0, amount_unapplied_cents: 5000, notes: "2 broken testers", created_at: "2026-11-20", created_by_user_id: null }] };
    if (path.startsWith("/api/v1/accounting/customer-refunds?")) return { refunds: [{ id: "rf1", display_id: "RF-2026-00001", customer_id: "cu1", credit_memo_id: "cm0",
      credit_memo_display_id: "CM-2026-0000", refund_date: "2026-11-21", amount_cents: 1500, method: "check", reference: "1040", bank_account_id: "b1",
      bank_account_name: "Operating Checking", memo: null, journal_entry_id: "je1", created_at: "2026-11-21", voided_at: null, void_reason: null }] };
    if (path.startsWith("/api/v1/banking/accounts/all?")) return { accounts: [
      { id: "b1", account_name: "Operating Checking", account_type: "checking", ledger_account_id: "l1000" },
      { id: "b2", account_name: "Business Credit Card", account_type: "credit_card", ledger_account_id: "l2010" },
      { id: "b3", account_name: "Store Cash Registers", account_type: "cash_on_hand", ledger_account_id: "l1010" }] };
    if (path === "/api/v1/scentsx/accounts") return { accounts: [acc("a4000", "4000", "Sales of Goods - Wholesale", "Income"), acc("a4800", "4800", "Sales Returns & Allowances", "Income"), acc("a6700", "6700", "Bad Debt Expense", "Expense")] };
    throw new Error(`unexpected ${path}`);
  });
});
const inv = (id: string, number: string, open: number) => ({ id, number, status: "sent", issue_date: "2026-08-01", due_date: "2026-08-31", days: 118, total_cents: open, paid_cents: 0, open_cents: open, bucket: "b3" as const, payments: [] });
const mount = () => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>
  <PerfumeCustomerCredits companyId="sx1" customerId="cu1" open={[inv("i1", "INV-1001", 120000), inv("i2", "INV-1002", 3000)]} onDone={async () => undefined} />
</ToastProvider></QueryClientProvider></MemoryRouter>);

describe("customer credits & write-offs", () => {
  it("bad-debt write-off = credit memo for the open balance on 6700, applied to that invoice, reason required", async () => {
    mount();
    await screen.findByText("CM-2026-0001");
    await waitFor(() => expect((screen.getByTestId("perfume-ar-writeoff") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("perfume-ar-writeoff"));
    const ok = await screen.findByTestId("perfume-ar-writeoff-confirm");
    expect((ok as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("perfume-ar-writeoff-reason"), { target: { value: "Store closed, owner unreachable" } });
    await waitFor(() => expect((screen.getByTestId("perfume-ar-writeoff-confirm") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("perfume-ar-writeoff-confirm"));
    await waitFor(() => expect(posts).toContainEqual([expect.stringMatching(/^\/api\/v1\/accounting\/credit-memos\?operating_company_id=sx1/), expect.objectContaining({
      customer_id: "cu1", amount_cents: 120000, reason: "other", account_id: "a6700", related_invoice_id: "i1", apply_to_invoice: true, notes: "Bad debt write-off: Store closed, owner unreachable" })]));
  });
  it("apply a credit memo: capped at the smaller of what is left and the invoice's open balance", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("perfume-ar-apply-cm1"));
    fireEvent.change(await screen.findByTestId("perfume-ar-apply-invoice"), { target: { value: "i2" } });
    fireEvent.click(screen.getByTestId("perfume-ar-apply-confirm"));
    await waitFor(() => expect(posts).toContainEqual(["/api/v1/accounting/credit-memos/cm1/apply?operating_company_id=sx1", { applications: [{ invoice_id: "i2", applied_cents: 3000 }] }]));
  });
  it("new credit memo defaults to Sales Returns & Allowances and can be kept as customer credit", async () => {
    mount();
    fireEvent.click(await screen.findByTestId("perfume-ar-new-credit"));
    await waitFor(() => expect((screen.getByTestId("perfume-ar-credit-account") as HTMLSelectElement).value).toBe("a4800"));
    const amt = screen.getByLabelText("Credit amount"); fireEvent.change(amt, { target: { value: "25.00" } }); fireEvent.blur(amt);
    await waitFor(() => expect((screen.getByTestId("perfume-ar-credit-save") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("perfume-ar-credit-save"));
    await waitFor(() => expect(posts.some(([p, b]) => p.startsWith("/api/v1/accounting/credit-memos?") && (b as { account_id: string; amount_cents: number; related_invoice_id?: string }).account_id === "a4800"
      && (b as { amount_cents: number }).amount_cents === 2500 && !(b as { related_invoice_id?: string }).related_invoice_id)).toBe(true));
  });
  it("refund a credit memo: from a bank or cash account (never the card), by check, capped at what is left; refunds listed and voidable", async () => {
    mount();
    await screen.findByText("RF-2026-00001");
    fireEvent.click(await screen.findByTestId("perfume-ar-refund-cm1"));
    const from = await screen.findByTestId("perfume-ar-refund-from");
    await waitFor(() => expect(Array.from((from as HTMLSelectElement).options).map((o) => o.value)).toEqual(["b1", "b3"]));
    const amt = screen.getByLabelText("Refund amount"); fireEvent.change(amt, { target: { value: "60.00" } }); fireEvent.blur(amt);
    await waitFor(() => expect((screen.getByTestId("perfume-ar-refund-save") as HTMLButtonElement).disabled).toBe(true));
    fireEvent.change(amt, { target: { value: "30.00" } }); fireEvent.blur(amt);
    fireEvent.change(screen.getByTestId("perfume-ar-refund-ref"), { target: { value: "1042" } });
    await waitFor(() => expect((screen.getByTestId("perfume-ar-refund-save") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("perfume-ar-refund-save"));
    await waitFor(() => expect(posts).toContainEqual([expect.stringMatching(/^\/api\/v1\/accounting\/customer-refunds\?operating_company_id=sx1/), expect.objectContaining({
      credit_memo_id: "cm1", bank_account_id: "b1", amount_cents: 3000, method: "check", reference: "1042", idempotency_key: expect.stringMatching(/^refund:cm1:/) })]));
    fireEvent.click(await screen.findByTestId("perfume-ar-refund-void-rf1"));
    fireEvent.change(await screen.findByTestId("perfume-ar-refund-void-reason"), { target: { value: "check never cashed" } });
    fireEvent.click(screen.getByTestId("perfume-ar-refund-void-confirm"));
    await waitFor(() => expect(posts).toContainEqual(["/api/v1/accounting/customer-refunds/rf1/void?operating_company_id=sx1", { reason: "check never cashed" }]));
  });
});
