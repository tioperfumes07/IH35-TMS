import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const receive = vi.fn();
vi.mock("../../../../api/accounting", () => ({
  listInvoices: vi.fn(async () => ({
    invoices: [
      { id: "inv-a1", display_id: "INV-2026-00001", customer_id: "cust-a", customer_name: "Acme", due_date: "2026-10-01", amount_open_cents: 60000, status: "sent" },
      { id: "inv-b1", display_id: "INV-2026-00002", customer_id: "cust-b", customer_name: "Bravo", due_date: "2026-10-02", amount_open_cents: 50000, status: "sent" },
    ],
  })),
}));
vi.mock("../../../../api/banking", () => ({
  getCoaAccounts: vi.fn(async () => ({ accounts: [] })),
  receivePaymentsAndMatchBankLine: (...a: unknown[]) => receive(...a),
}));
vi.mock("../../../../components/Toast", () => ({ useToast: () => ({ pushToast: vi.fn() }) }));

import { ReceiveAgainstInvoicesPanel } from "../ReceiveAgainstInvoicesPanel";

function wrap(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ROUND 433 B8 — receive one deposit against several invoices", () => {
  it("selects two invoices of two customers, shows Deposit / Selected / Remainder, and sends one application each", async () => {
    receive.mockResolvedValue({ ok: true, result: { payments: [{}, {}], match_ids: [], applied_cents: 100000, remainder_cents: 0, bank_amount_cents: 100000, difference_journal_entry_id: null } });
    const onReceived = vi.fn();
    wrap(<ReceiveAgainstInvoicesPanel operatingCompanyId="co" bankTransactionId="bt-1" bankAmountCents={100000} onReceived={onReceived} />);
    fireEvent.click(await screen.findByTestId("receive-invoice-check-inv-a1"));
    fireEvent.click(screen.getByTestId("receive-invoice-check-inv-b1"));
    // a1 takes its open 600.00, b1 takes what is left of the deposit (400.00), so the money closes
    expect(screen.getByTestId("receive-against-invoices-selected").textContent).toContain("1,000.00");
    expect(screen.getByTestId("receive-against-invoices-remainder").textContent).toMatch(/0\.00/);
    const confirm = screen.getByTestId("receive-against-invoices-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(receive).toHaveBeenCalled());
    expect(receive.mock.calls[0][0]).toMatchObject({
      bank_transaction_id: "bt-1",
      applications: [{ invoice_id: "inv-a1", amount_cents: 60000 }, { invoice_id: "inv-b1", amount_cents: 40000 }],
      remainder: null,
    });
    await waitFor(() => expect(onReceived).toHaveBeenCalled());
  });

  it("a remainder must be given a home before confirming", async () => {
    wrap(<ReceiveAgainstInvoicesPanel operatingCompanyId="co" bankTransactionId="bt-1" bankAmountCents={100000} />);
    fireEvent.click(await screen.findByTestId("receive-invoice-check-inv-b1"));
    expect(screen.getByTestId("receive-against-invoices-remainder-home")).toBeTruthy();
    // default home: credit on account for the selected customer -> confirm allowed and sends it
    expect((screen.getByTestId("receive-against-invoices-confirm") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByLabelText(/Difference account/i, { selector: "input" }) ?? screen.getAllByRole("radio")[1]);
    expect(screen.getByTestId("receive-against-invoices-blocker").textContent).toMatch(/difference account/i);
    expect((screen.getByTestId("receive-against-invoices-confirm") as HTMLButtonElement).disabled).toBe(true);
  });
});
