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
});
