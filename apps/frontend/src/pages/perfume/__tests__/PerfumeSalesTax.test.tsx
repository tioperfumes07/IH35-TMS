import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeSalesTaxPanel } from "../PerfumeSalesTaxPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// ROUND L.31 M11 — ScentsX sales tax: liability from 2100, sales by month, and "Pay sales tax" = a bill to the agency coded to 2100,
// paid from the bank through the bill engines, then the return marked paid with that bill.
const posts: Array<[string, unknown]> = [];
let withAgency = true;
beforeEach(() => {
  posts.length = 0;
  withAgency = true;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method === "POST") {
      posts.push([path, opts.body]);
      if (path.startsWith("/api/v1/accounting/bills?")) return { bill: { id: "bill1" } };
      if (path === "/api/v1/mdata/vendors") return { id: "vTX" };
      return { agency: { id: "ag1" }, sales_tax_return: { id: "r1", tax_owed_cents: 825 } };
    }
    if (path === "/api/v1/scentsx/company") return { company: { id: "sx1", code: "SCENTSX", legal_name: "ScentsX LLC" } };
    if (path.startsWith("/api/v1/scentsx/sales-tax/liability?")) return { operating_company_id: "sx1", from: "2026-11-01", to: "2026-11-27",
      account: { account_id: "a2100", account_number: "2100", account_name: "Sales Tax Payable - Texas" },
      liability: { opening_cents: 0, collected_cents: 825, paid_cents: 0, closing_cents: 825, lines: [] },
      sales: { months: [{ month: "2026-11", invoices: 2, exempt_invoices: 1, taxable_sales_cents: 10000, exempt_sales_cents: 5000, tax_cents: 825 }], taxable_sales_cents: 10000, exempt_sales_cents: 5000, tax_on_invoices_cents: 825 } };
    if (path.startsWith("/api/v1/accounting/sales-tax/agencies?")) return { agencies: withAgency ? [{ id: "ag1", operating_company_id: "sx1", name: "Texas Comptroller of Public Accounts", jurisdiction: "Texas", agency_vendor_id: "vTX", created_at: "" }] : [] };
    if (path.startsWith("/api/v1/accounting/sales-tax/returns?")) return { returns: [{ id: "r1", agency_id: "ag1", agency_name: "Texas Comptroller of Public Accounts", period_start: "2026-11-01", period_end: "2026-11-30",
      taxable_sales_cents: 10000, non_taxable_sales_cents: 5000, tax_collected_cents: 825, tax_owed_cents: 825, status: "filed", filed_at: "2026-12-05", paid_bill_id: null, paid_bill_number: null, created_at: "" }] };
    if (path.startsWith("/api/v1/banking/accounts/all?")) return { accounts: [{ id: "b1", account_name: "Operating Checking", account_type: "checking", ledger_account_id: "l1000" },
      { id: "b2", account_name: "Business Credit Card", account_type: "credit_card", ledger_account_id: "l2010" }] };
    throw new Error(`unexpected ${path}`);
  });
});
const mount = () => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><PerfumeSalesTaxPanel /></ToastProvider></QueryClientProvider></MemoryRouter>);

describe("ScentsX sales tax", () => {
  it("shows the liability from 2100 and pays a return as a bill coded to 2100 paid from the bank, then marks it paid", async () => {
    mount();
    expect(await screen.findByText("2026-11")).toBeTruthy();
    expect((await screen.findByTestId("scentsx-stx-account")).textContent).toMatch(/Sales Tax Payable - Texas/);
    fireEvent.click(await screen.findByTestId("scentsx-stx-pay-r1"));
    const bank = await screen.findByTestId("scentsx-stx-bank");
    await waitFor(() => expect(Array.from((bank as HTMLSelectElement).options).map((o) => o.value)).toEqual(["b1"]));
    fireEvent.change(screen.getByTestId("scentsx-stx-ref"), { target: { value: "WEBFILE-123" } });
    await waitFor(() => expect((screen.getByTestId("scentsx-stx-pay-save") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("scentsx-stx-pay-save"));
    await waitFor(() => expect(posts.map((p) => p[0].split("?")[0])).toEqual(["/api/v1/accounting/bills", "/api/v1/accounting/bills/bill1/pay", "/api/v1/accounting/sales-tax/returns/r1/mark-paid"]));
    expect(posts[0]![1]).toMatchObject({ vendor_id: "vTX", amount_cents: 825, lines: [{ account_id: "a2100", amount_cents: 825 }] });
    expect(posts[1]![1]).toMatchObject({ amount_cents: 825, payment_method: "ach", from_bank_account_id: "b1", reference_number: "WEBFILE-123" });
    expect(posts[2]![1]).toEqual({ operating_company_id: "sx1", paid_bill_id: "bill1" });
  });
  it("with no agency yet: sets up the Texas Comptroller as a ScentsX vendor + the agency", async () => {
    withAgency = false;
    mount();
    const set = await screen.findByTestId("scentsx-stx-agency");
    await waitFor(() => expect((set as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(set);
    await waitFor(() => expect(posts.map((p) => p[0])).toEqual(["/api/v1/mdata/vendors", "/api/v1/accounting/sales-tax/agencies"]));
    expect(posts[1]![1]).toMatchObject({ operating_company_id: "sx1", name: "Texas Comptroller of Public Accounts", agency_vendor_id: "vTX" });
  });
});
