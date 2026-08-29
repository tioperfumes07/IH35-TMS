import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ManualDailyProjectionsTab } from "./ManualDailyProjectionsTab";
import { ToastProvider } from "../../../components/Toast";

const listForecastEntries = vi.fn();
const createForecastEntry = vi.fn();
const getForecastOpeningBalance = vi.fn();
const putForecastOpeningBalance = vi.fn();
const updateForecastEntry = vi.fn();
const deleteForecastEntry = vi.fn();
const listBills = vi.fn();
const listExpenses = vi.fn();
const listBillPayments = vi.fn();
const listInvoices = vi.fn();
const getBankingTiles = vi.fn();

vi.mock("../../../api/forecast", () => ({
  listForecastEntries: (...args: unknown[]) => listForecastEntries(...args),
  createForecastEntry: (...args: unknown[]) => createForecastEntry(...args),
  updateForecastEntry: (...args: unknown[]) => updateForecastEntry(...args),
  deleteForecastEntry: (...args: unknown[]) => deleteForecastEntry(...args),
  getForecastOpeningBalance: (...args: unknown[]) => getForecastOpeningBalance(...args),
  putForecastOpeningBalance: (...args: unknown[]) => putForecastOpeningBalance(...args),
}));

vi.mock("../../../api/accounting", () => ({
  listBills: (...args: unknown[]) => listBills(...args),
  listExpenses: (...args: unknown[]) => listExpenses(...args),
  listBillPayments: (...args: unknown[]) => listBillPayments(...args),
  listInvoices: (...args: unknown[]) => listInvoices(...args),
}));

vi.mock("../../../api/banking", () => ({
  getBankingTiles: (...args: unknown[]) => getBankingTiles(...args),
}));

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const TODAY = new Date().toISOString().slice(0, 10);

const BILL_ROW = { id: "b1", bill_number: "BILL-1", vendor_uuid: "v1", vendor_name: "Acme Vendor", balance_cents: 5000, amount_cents: 5000 };
const EXPENSE_ROW = { id: "e1", expense_number: "EXP-1", vendor_uuid: "v2", vendor_name: "Fuel Co", total_amount_cents: 3000 };

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ToastProvider>
          <ManualDailyProjectionsTab operatingCompanyId={COMPANY_ID} />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// GO-0042-CASH-FLOW-MANUAL-PULL-RETRY-DUPLICATE-ENTRIES: pullMutation POSTs one
// createForecastEntry() per candidate row sequentially. If a mid-loop failure (e.g. the real
// 30/min rate limit) throws AFTER some rows already committed, onError used to leave the query
// cache stale -- a retry rebuilt its dedupe set (existingKeys) from that stale cache and
// re-created the already-committed rows, silently doubling the projected totals with no error on
// the eventual successful retry.
//
// The "server" state below (`committedEntries`) is the source of truth for listForecastEntries,
// updated whenever createForecastEntry actually succeeds -- this makes the test robust to exactly
// how many times React Query happens to call the query function, and asserts the real regression
// (does a second Pull re-POST a row that already landed) rather than a brittle call-count.
describe("ManualDailyProjectionsTab — pull-and-retry duplicate prevention (GO-0042)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("a failed pull invalidates the entries cache so a retry does not re-create already-committed rows", async () => {
    const user = userEvent.setup();
    getForecastOpeningBalance.mockResolvedValue({ amount_cents: 0 });
    getBankingTiles.mockResolvedValue({ tiles: [] });
    listInvoices.mockResolvedValue({ invoices: [] });
    listBillPayments.mockResolvedValue({ rows: [] });
    listBills.mockResolvedValue({ rows: [BILL_ROW] });
    listExpenses.mockResolvedValue({ rows: [EXPENSE_ROW] });

    const committedEntries: Array<{ id: string; entry_date: string; direction: string; invoice_no: string; party_ref_id: string; amount_cents: number }> = [];
    listForecastEntries.mockImplementation(async () => ({ entries: [...committedEntries] }));

    let creates = 0;
    createForecastEntry.mockImplementation(async (payload: { invoice_no: string; party_ref_id?: string | null; direction: string; amount_cents: number }) => {
      creates += 1;
      // First create (BILL-1) succeeds and lands in the "server" state; the second
      // (EXP-1, on the FIRST pull attempt) fails, simulating a mid-loop rate limit -- BILL-1 is
      // already committed by the time the throw happens.
      if (creates === 2) throw new Error("Too Many Requests");
      const row = { id: `created-${creates}`, entry_date: TODAY, direction: payload.direction, invoice_no: payload.invoice_no, party_ref_id: payload.party_ref_id ?? "", amount_cents: payload.amount_cents };
      committedEntries.push(row);
      return row;
    });

    renderTab();

    const pullButton = await screen.findByRole("button", { name: /pull bills/i });
    await user.click(pullButton);

    await screen.findByText(/too many requests/i);
    expect(committedEntries.map((e) => e.invoice_no)).toEqual(["BILL-1"]);

    await waitFor(() => expect(screen.getByRole("button", { name: /pull bills/i })).not.toBeDisabled());
    await user.click(screen.getByRole("button", { name: /pull bills/i }));

    await waitFor(() => expect(createForecastEntry).toHaveBeenCalledTimes(3));
    // The critical assertion: BILL-1 must NOT be POSTed a second time on the retry -- only EXP-1
    // (the row that never actually landed on the first attempt) should be created.
    const thirdCallPayload = createForecastEntry.mock.calls[2][0] as { invoice_no: string };
    expect(thirdCallPayload.invoice_no).toBe("EXP-1");
    expect(createForecastEntry.mock.calls.filter((c) => (c[0] as { invoice_no: string }).invoice_no === "BILL-1")).toHaveLength(1);
  });

  it("disables the Pull button while the post-error entries refetch is in flight", async () => {
    const user = userEvent.setup();
    getForecastOpeningBalance.mockResolvedValue({ amount_cents: 0 });
    getBankingTiles.mockResolvedValue({ tiles: [] });
    listInvoices.mockResolvedValue({ invoices: [] });
    listBillPayments.mockResolvedValue({ rows: [] });
    listExpenses.mockResolvedValue({ rows: [] });
    listBills.mockResolvedValue({ rows: [BILL_ROW] });
    createForecastEntry.mockRejectedValue(new Error("Too Many Requests"));

    let blockRefetch: (() => void) | undefined;
    let sawPostErrorFetch = false;
    listForecastEntries.mockImplementation(async () => {
      if (sawPostErrorFetch) {
        await new Promise<void>((resolve) => {
          blockRefetch = resolve;
        });
      }
      return { entries: [] };
    });

    renderTab();
    const pullButton = await screen.findByRole("button", { name: /pull bills/i });
    sawPostErrorFetch = true;
    await user.click(pullButton);

    await screen.findByText(/too many requests/i);
    // The invalidated refetch is blocked (mid-flight) -- button must stay disabled, not just
    // while pullMutation itself is pending.
    await waitFor(() => expect(screen.getByRole("button", { name: /pull bills/i })).toBeDisabled());

    blockRefetch?.();
    await waitFor(() => expect(screen.getByRole("button", { name: /pull bills/i })).not.toBeDisabled());
  });
});
