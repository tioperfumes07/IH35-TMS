import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeReceivablesPanel } from "../PerfumeReceivablesPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-27 13:50 CT: CONTROL's Aging Balance Report, Customer Account Status / Invoice History and Payments Entry, in the app.
const days = { d1: 30, d2: 60, d3: 90 };
const inv = (id: string, n: string, date: string, d: number, total: number, open: number, bucket: string | null, payments: unknown[] = []) =>
  ({ id, number: n, status: "sent", issue_date: date, due_date: null, days: d, total_cents: total, paid_cents: total - open, open_cents: open, bucket, payments });
const calls: Array<[string, unknown]> = [];
beforeEach(() => {
  calls.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method) calls.push([path, opts.body]);
    if (path.startsWith("/api/v1/scentsx/receivables/aging")) return { as_of: "2026-11-27", days, totals: { current: 10000, b1: 0, b2: 0, b3: 30000, total: 40000 },
      customers: [{ customer_id: "c1", customer: "SHOPEASY LLC", perfume_company_id: "p1", invoices: 2, oldest_days: 120, current: 10000, b1: 0, b2: 0, b3: 30000, total: 40000 }] };
    if (path.startsWith("/api/v1/scentsx/receivables/customers/c1")) return { as_of: "2026-11-27", days, operating_company_id: "sx",
      customer: { id: "c1", name: "SHOPEASY LLC", perfume_company_id: "p1", terms_days: 30, credit_limit_cents: 20000 },
      buckets: { current: 10000, b1: 0, b2: 0, b3: 30000, total: 40000 },
      open_invoices: [inv("i2", "INV-2", "2026-07-30", 120, 30000, 30000, "b3"), inv("i1", "INV-1", "2026-11-27", 0, 10000, 10000, "current")],
      invoices: [inv("i2", "INV-2", "2026-07-30", 120, 30000, 30000, "b3"), inv("i1", "INV-1", "2026-11-27", 0, 10000, 10000, "current")], payments: [] };
    if (path === "/api/v1/scentsx/returns" && !opts?.method) return { returns: [] };
    if (path.startsWith("/api/v1/accounting/customers/c1/statement")) return { counterparty_id: "c1", counterparty_name: "SHOPEASY LLC", from_date: "2026-01-01", to_date: "2026-11-27",
      opening_balance_cents: 0, closing_balance_cents: 40000, lines: [
        { date: "2026-07-30", type: "invoice", reference: "INV-2", description: "Invoice INV-2", debit_cents: 30000, credit_cents: 0, running_balance_cents: 30000, link_kind: "invoice", link_id: "i2" },
        { date: "2026-11-27", type: "invoice", reference: "INV-1", description: "Invoice INV-1", debit_cents: 10000, credit_cents: 0, running_balance_cents: 40000, link_kind: "invoice", link_id: "i1" }] };
    if (path === "/api/v1/scentsx/returns") return { id: "r1", return_no: "RET-2026-00001", merchandise_cents: 5000, tax_cents: 0, credit_memo_ids: ["cm1"] };
    if (path.startsWith("/api/v1/scentsx/invoices/i2/returnable")) return { invoice: { id: "i2", number: "INV-2", status: "sent", customer_id: "c1", customer: "SHOPEASY LLC", issue_date: "2026-07-30", total_cents: 30000 },
      lines: [{ so_line_id: "l1", line_no: 1, item_id: "it1", description: "GOOD GIRL 80ml", unit_price_cents: 2500, billed: 12, returned: 0, can_return: 12 }], returns: [] };
    if (path.startsWith("/api/v1/perfume/inventory/sites")) return { sites: [{ code: "LRD", name: "Laredo", own: true, active: true, kind: "warehouse" }] };
    if (path.startsWith("/api/v1/accounting/payments")) return { id: "pm1", display_id: "PMT-2026-00001", amount_unapplied_cents: 0, applications_count: 2 };
    throw new Error(`unexpected ${path}`);
  });
});
const mount = (at = "/perfume?tab=receivables") => render(<MemoryRouter initialEntries={[at]}><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><PerfumeReceivablesPanel /></ToastProvider></QueryClientProvider></MemoryRouter>);

describe("receivables", () => {
  it("aging report by customer with the bucket totals", async () => {
    mount();
    const t = await screen.findByTestId("perfume-ar-totals");
    await waitFor(() => expect(t.textContent).toContain("$400.00"));
    expect(await screen.findByText("SHOPEASY LLC")).toBeTruthy();
  });
  it("customer account: over the limit, and one payment applied oldest first through the payment engine", async () => {
    mount("/perfume?tab=receivables&open=c1");
    const acct = await screen.findByTestId("perfume-ar-customer");
    await waitFor(() => expect(within(acct).getByTestId("perfume-ar-over-limit")).toBeTruthy());
    const pay = within(acct).getByTestId("perfume-ar-payment");
    fireEvent.change(within(pay).getByLabelText("Payment amount"), { target: { value: "350.00" } });
    fireEvent.blur(within(pay).getByLabelText("Payment amount"));
    fireEvent.change(within(pay).getByTestId("perfume-ar-pay-ref"), { target: { value: "CHK 77" } });
    fireEvent.click(within(pay).getByTestId("perfume-ar-pay-oldest"));
    await waitFor(() => expect((within(pay).getByTestId("perfume-ar-pay-save") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(pay).getByTestId("perfume-ar-pay-save"));
    await waitFor(() => expect(calls).toContainEqual([expect.stringContaining("/api/v1/accounting/payments"), expect.objectContaining({
      customer_id: "c1", amount_cents: 35000, reference: "CHK 77", payment_method: "check",
      apply_to: [{ invoice_id: "i2", amount_cents: 30000 }, { invoice_id: "i1", amount_cents: 5000 }] })]));
  });
  it("a return on an invoice: quantity, back to stock, reason — posted to the returns engine", async () => {
    mount("/perfume?tab=receivables&open=c1");
    fireEvent.click(await screen.findByTestId("perfume-ar-return-i2"));
    const f = await screen.findByTestId("perfume-return-form");
    fireEvent.change(await within(f).findByTestId("perfume-return-qty-1"), { target: { value: "2" } });
    fireEvent.change(within(f).getByTestId("perfume-return-reason"), { target: { value: "wrong_item" } });
    fireEvent.click(within(f).getByTestId("perfume-return-save"));
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/scentsx/returns", expect.objectContaining({ invoice_id: "i2", reason: "wrong_item",
      lines: [{ so_line_id: "l1", qty: 2, restock: true, location_code: null }] })]));
  });
  it("customer statement: opening balance, the activity with running balance, closing balance", async () => {
    mount("/perfume?tab=receivables&open=c1");
    const st = await screen.findByTestId("perfume-ar-statement");
    await waitFor(() => expect(st.textContent).toContain("Closing balance"));
    expect(st.textContent).toContain("Opening balance");
    expect(st.textContent).toContain("Invoice INV-2");
    expect(st.textContent).toContain("$400.00");
  });
});
