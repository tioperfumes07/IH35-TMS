import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumePayablesPanel } from "../PerfumePayablesPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-27 15:05 CT: "fully wire … liabilities … ap … vendors" — A/P aging, vendor account, pay a bill, vendor statement.
const b = { current: 10000, d1_30: 0, d31_60: 20000, d61_90: 0, d90_plus: 0, total: 30000 };
const calls: Array<[string, unknown]> = [];
beforeEach(() => {
  calls.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method) calls.push([path, opts.body]);
    if (path.startsWith("/api/v1/scentsx/payables/aging")) return { as_of: "2026-11-27", operating_company_id: "sx", totals: b,
      vendors: [{ ...b, vendor_id: "v1", vendor: "FRAGRANCE DIST LLC", perfume_vendor_id: "pv1", bills: 2, oldest_past_due: 45 }] };
    if (path.startsWith("/api/v1/scentsx/payables/vendors/v1")) return { as_of: "2026-11-27", operating_company_id: "sx",
      vendor: { id: "v1", name: "FRAGRANCE DIST LLC", perfume_vendor_id: "pv1", perfume_vendor: "Fragrance Dist" }, buckets: b,
      open_bills: [{ id: "bl2", display_id: "BILL-2026-00002", bill_number: "INV-88", vendor_id: "v1", bill_date: "2026-09-01", due_date: "2026-10-13", past_due: 45,
        amount_cents: 25000, settled_cents: 5000, open_cents: 20000, bucket: "d31_60", purchase_order_id: "p1", po_number: "PO-000001" }],
      bills: [], payments: [], bank_accounts: [{ id: "bk1", name: "Operating Checking", account_type: "checking", account_number: "1000" }] };
    if (path.startsWith("/api/v1/accounting/vendors/v1/statement")) return { counterparty_id: "v1", counterparty_name: "FRAGRANCE DIST LLC", from_date: "2026-01-01", to_date: "2026-11-27",
      opening_balance_cents: 0, closing_balance_cents: 30000, lines: [] };
    if (path.startsWith("/api/v1/scentsx/payables/vendors/pv9")) throw new clientApi.ApiError(409, { error: "vendor_not_on_books", supplier_name: "Awesome Perfumes Wholesale" });
    if (path.startsWith("/api/v1/accounting/bills/bl2/pay")) return { payment: { id: "bp1" } };
    throw new Error(`unexpected ${path}`);
  });
});
const mount = (at = "/perfume?tab=payables") => render(<MemoryRouter initialEntries={[at]}><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><PerfumePayablesPanel /></ToastProvider></QueryClientProvider></MemoryRouter>);

describe("payables", () => {
  it("A/P aging by vendor with the bucket totals", async () => {
    mount();
    const t = await screen.findByTestId("perfume-ap-totals");
    await waitFor(() => expect(t.textContent).toContain("$300.00"));
    expect(await screen.findByText("FRAGRANCE DIST LLC")).toBeTruthy();
  });
  it("vendor account: open bill linked to its PO, pay it by check from Operating Checking through the bill engine", async () => {
    mount("/perfume?tab=payables&open=v1");
    const acct = await screen.findByTestId("perfume-ap-vendor");
    await waitFor(() => expect(within(acct).getAllByText("PO-000001").length).toBeGreaterThan(0));
    fireEvent.click(within(acct).getByTestId("perfume-ap-pay-bl2"));
    const f = await within(acct).findByTestId("perfume-ap-pay-form");
    expect((within(f).getByTestId("perfume-ap-pay-save") as HTMLButtonElement).disabled).toBe(true); // a check needs its number
    fireEvent.change(within(f).getByTestId("perfume-ap-pay-check"), { target: { value: "1042" } });
    fireEvent.click(within(f).getByTestId("perfume-ap-pay-save"));
    await waitFor(() => expect(calls).toContainEqual([expect.stringContaining("/api/v1/accounting/bills/bl2/pay"), expect.objectContaining({
      amount_cents: 20000, payment_method: "check", from_bank_account_id: "bk1", check_number: "1042" })]));
    expect(calls[0]![0]).toContain("operating_company_id=sx");
    expect(screen.getByTestId("perfume-ap-statement").textContent).toContain("Vendor statement");
  });
  it("a supplier that is not a ScentsX vendor yet: says so and points to Make ScentsX vendor (no red error)", async () => {
    mount("/perfume?tab=payables&open=pv9");
    const box = await screen.findByTestId("perfume-ap-not-on-books");
    expect(box.textContent).toContain("Awesome Perfumes Wholesale");
    expect(box.textContent).toContain("Not a ScentsX vendor yet");
    expect(screen.getByTestId("perfume-ap-make-vendor").getAttribute("href")).toBe("/perfume?tab=suppliers");
    expect(screen.queryByText("Couldn't load the vendor's account")).toBeNull();
  });
});
