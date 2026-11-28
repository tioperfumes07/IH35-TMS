import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeSupplierDeposits } from "../PerfumeSupplierDeposits";
import type { ScentsxVendorAccount } from "../../../api/scentsx";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// ROUND L.31 M6: supplier deposits — a 1310 deposit bill paid at once; used later as a 1310 vendor credit applied to the goods bill.
const calls: Array<[string, unknown]> = [];
beforeEach(() => {
  calls.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    calls.push([path, opts?.body]);
    if (path.startsWith("/api/v1/accounting/bills?")) return { bill: { id: "depbill1" } };
    if (path.startsWith("/api/v1/accounting/vendor-credits?")) return { id: "vc1" };
    return { ok: true, applicationIds: ["x"] };
  });
});
const acct = (available: number): ScentsxVendorAccount => ({
  as_of: "2026-11-27", operating_company_id: "sx1", vendor: { id: "v1", name: "Parfums Lyon", perfume_vendor_id: null, perfume_vendor: null },
  buckets: { current: 1000000, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 1000000 },
  open_bills: [{ id: "b1", display_id: "BILL-1", bill_number: "INV-77", vendor_id: "v1", bill_date: "2026-11-30", due_date: "2026-12-30", past_due: 0, amount_cents: 1000000,
    settled_cents: 0, open_cents: 1000000, bucket: "current", purchase_order_id: null, po_number: null }],
  bills: [], payments: [], credits: [], bank_accounts: [{ id: "bank-1000", name: "Operating Checking", account_type: "checking", account_number: "1000" }],
  deposits: { account_id: "a1310", paid_cents: available, used_cents: 0, available_cents: available },
} as unknown as ScentsxVendorAccount);
const mount = (a: ScentsxVendorAccount) => render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><ToastProvider><PerfumeSupplierDeposits a={a} onDone={async () => undefined} /></ToastProvider></QueryClientProvider></MemoryRouter>);

describe("supplier deposits", () => {
  it("pay deposit: a deposit bill on 1310, then paid by check from the bank", async () => {
    mount(acct(0));
    fireEvent.click(screen.getByTestId("perfume-ap-deposit-new"));
    const amt = await screen.findByLabelText("Deposit amount"); fireEvent.change(amt, { target: { value: "3000.00" } }); fireEvent.blur(amt);
    fireEvent.change(screen.getByTestId("perfume-ap-deposit-ref"), { target: { value: "5001" } });
    await waitFor(() => expect((screen.getByTestId("perfume-ap-deposit-save") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("perfume-ap-deposit-save"));
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls[0]![0]).toMatch(/^\/api\/v1\/accounting\/bills\?operating_company_id=sx1/);
    expect(calls[0]![1]).toMatchObject({ vendor_id: "v1", amount_cents: 300000, lines: [{ account_id: "a1310", amount_cents: 300000 }] });
    expect(calls[1]![0]).toMatch(/^\/api\/v1\/accounting\/bills\/depbill1\/pay/);
    expect(calls[1]![1]).toMatchObject({ amount_cents: 300000, payment_method: "check", from_bank_account_id: "bank-1000", check_number: "5001" });
  });
  it("use deposit: a 1310 vendor credit applied to the bill, never more than what is available", async () => {
    mount(acct(300000));
    expect(screen.getByTestId("perfume-ap-deposit-available").textContent).toMatch(/\$3,000\.00/);
    fireEvent.click(screen.getByTestId("perfume-ap-deposit-use"));
    fireEvent.click(await screen.findByTestId("perfume-ap-deposit-use-confirm"));
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls[0]![1]).toMatchObject({ vendor_id: "v1", amount_cents: 300000, coa_account_id: "a1310" });
    expect(calls[1]![0]).toBe("/api/v1/accounting/vendor-credits/vc1/apply?operating_company_id=sx1");
    expect(calls[1]![1]).toMatchObject({ applications: [{ bill_id: "b1", applied_cents: 300000 }] });
  });
});
