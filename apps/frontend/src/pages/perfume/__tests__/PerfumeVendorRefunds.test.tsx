import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeVendorCredits } from "../PerfumeApplyVendorCredit";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Vendor refunds (mirror of customer refunds): a vendor pays back a vendor credit into a bank or cash account, never the card.
const posts: Array<[string, unknown]> = [];
beforeEach(() => {
  posts.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method === "POST") { posts.push([path, opts.body]); return { refund: { id: "vrN", display_id: "VR-2026-00002" } }; }
    if (path.startsWith("/api/v1/accounting/vendor-refunds?")) return { refunds: [{ id: "vr1", display_id: "VR-2026-00001", vendor_id: "v1", vendor_credit_id: "vc0",
      vendor_credit_display_id: "VC-2026-0000", refund_date: "2026-11-21", amount_cents: 1500, method: "ach", reference: null, bank_account_id: "b1",
      bank_account_name: "Operating Checking", memo: null, journal_entry_id: "je1", created_at: "2026-11-21", voided_at: null, void_reason: null }] };
    throw new Error(`unexpected ${path}`);
  });
});
const mount = () => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>
  <PerfumeVendorCredits companyId="sx1" vendorId="v1" openBills={[]} onDone={async () => undefined}
    credits={[{ id: "vc1", display_id: "VC-2026-0001", issue_date: "2026-11-20", status: "open", notes: "2 damaged", amount_cents: 5000, applied_cents: 0, unapplied_cents: 5000 }]}
    banks={[{ id: "b1", name: "Operating Checking", account_type: "checking", account_number: "1000" }, { id: "b2", name: "Business Credit Card", account_type: "credit_card", account_number: "2010" },
      { id: "b3", name: "Store Cash Registers", account_type: "cash_on_hand", account_number: "1010" }]} />
</ToastProvider></QueryClientProvider></MemoryRouter>);

describe("vendor refunds", () => {
  it("refund received: into a bank or cash account (never the card), capped at the credit left; refunds listed and voidable", async () => {
    mount();
    await screen.findByText("VR-2026-00001");
    fireEvent.click(await screen.findByTestId("perfume-ap-refund-credit-vc1"));
    const to = await screen.findByTestId("perfume-ap-refund-to");
    expect(Array.from((to as HTMLSelectElement).options).map((o) => o.value)).toEqual(["b1", "b3"]);
    const amt = screen.getByLabelText("Vendor refund amount"); fireEvent.change(amt, { target: { value: "60.00" } }); fireEvent.blur(amt);
    await waitFor(() => expect((screen.getByTestId("perfume-ap-refund-save") as HTMLButtonElement).disabled).toBe(true));
    fireEvent.change(amt, { target: { value: "30.00" } }); fireEvent.blur(amt);
    fireEvent.change(screen.getByTestId("perfume-ap-refund-ref"), { target: { value: "88123" } });
    await waitFor(() => expect((screen.getByTestId("perfume-ap-refund-save") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId("perfume-ap-refund-save"));
    await waitFor(() => expect(posts).toContainEqual([expect.stringMatching(/^\/api\/v1\/accounting\/vendor-refunds\?operating_company_id=sx1/), expect.objectContaining({
      vendor_credit_id: "vc1", bank_account_id: "b1", amount_cents: 3000, method: "check", reference: "88123", idempotency_key: expect.stringMatching(/^vrefund:vc1:/) })]));
    fireEvent.click(await screen.findByTestId("perfume-ap-refund-void-vr1"));
    fireEvent.change(await screen.findByTestId("perfume-ap-refund-void-reason"), { target: { value: "check bounced" } });
    fireEvent.click(screen.getByTestId("perfume-ap-refund-void-confirm"));
    await waitFor(() => expect(posts).toContainEqual(["/api/v1/accounting/vendor-refunds/vr1/void?operating_company_id=sx1", { reason: "check bounced" }]));
  });
});
