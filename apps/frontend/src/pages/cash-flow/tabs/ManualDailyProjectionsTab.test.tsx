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

const getCashFlowOpeningCash = vi.fn();
vi.mock("../../../api/cashFlow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../api/cashFlow")>()),
  getCashFlowOpeningCash: (...args: unknown[]) => getCashFlowOpeningCash(...args),
  pullManualTransactions: (...args: unknown[]) => pullManualTransactions(...args),
}));

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";


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

// GO-0042-CASH-FLOW-MANUAL-PULL-RETRY-DUPLICATE-ENTRIES: the Pull is now ONE atomic server call
// (POST /api/v1/cash-flow/manual/pull -> manual-pull.service.ts, which serializes same-company/date
// retries and dedupes against what already landed; proven by apps/backend/src/cash-flow/__tests__/
// manual-pull.test.ts). The client contract that still matters: a failed pull shows its error AND
// invalidates the entries cache (so the screen never shows a stale list after a partial server write),
// and the button stays disabled until that refetch finishes. LEAD 443.283 retargeted these two tests
// from the retired client-side create loop (createForecastEntry per row — red on main) to that contract.
const pullManualTransactions = vi.fn();

describe("ManualDailyProjectionsTab — pull-and-retry duplicate prevention (GO-0042)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("a failed pull shows its error, refetches entries, and a retry calls the server pull again", async () => {
    const user = userEvent.setup();
    getForecastOpeningBalance.mockResolvedValue({ amount_cents: 0 });
    getBankingTiles.mockResolvedValue({ tiles: [] });
    getCashFlowOpeningCash.mockResolvedValue({ opening_cash_cents: 0, accounts: [] });
    listForecastEntries.mockResolvedValue({ entries: [] });
    pullManualTransactions.mockRejectedValueOnce(new Error("Too Many Requests")).mockResolvedValueOnce({ created: 1, issues: [] });

    renderTab();
    const pullButton = await screen.findByRole("button", { name: /pull bills/i });
    const fetchesBefore = listForecastEntries.mock.calls.length;
    await user.click(pullButton);

    await screen.findByText(/too many requests/i);
    await waitFor(() => expect(listForecastEntries.mock.calls.length).toBeGreaterThan(fetchesBefore));

    await waitFor(() => expect(screen.getByRole("button", { name: /pull bills/i })).not.toBeDisabled());
    await user.click(screen.getByRole("button", { name: /pull bills/i }));
    await waitFor(() => expect(pullManualTransactions).toHaveBeenCalledTimes(2));
    expect(pullManualTransactions.mock.calls[0][0]).toBe(COMPANY_ID);
  });

  it("disables the Pull button while the post-error entries refetch is in flight", async () => {
    const user = userEvent.setup();
    getForecastOpeningBalance.mockResolvedValue({ amount_cents: 0 });
    getBankingTiles.mockResolvedValue({ tiles: [] });
    getCashFlowOpeningCash.mockResolvedValue({ opening_cash_cents: 0, accounts: [] });
    pullManualTransactions.mockRejectedValue(new Error("Too Many Requests"));

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
    await waitFor(() => expect(screen.getByRole("button", { name: /pull bills/i })).toBeDisabled());

    blockRefetch?.();
    await waitFor(() => expect(screen.getByRole("button", { name: /pull bills/i })).not.toBeDisabled());
  });
});

// LEAD 443.283 — the Manual tab lists only authoritative operating cash and its total equals Home.
describe("ManualDailyProjectionsTab opening cash (443.283)", () => {
  afterEach(() => vi.clearAllMocks());
  it("lists the authoritative accounts and shows their total, never card or factoring tiles", async () => {
    listForecastEntries.mockResolvedValue({ entries: [] });
    getForecastOpeningBalance.mockResolvedValue({ operating_company_id: COMPANY_ID, amount_cents: 0, as_of_date: null });
    getBankingTiles.mockResolvedValue({ tiles: [{ id: "card", display_name: "Dreamline Diesel Card", tile_kind: "real", current_balance: -140226.34 }] });
    getCashFlowOpeningCash.mockResolvedValue({
      opening_cash_cents: 2553337,
      accounts: [
        { id: "bofa", display_name: "USMCA FREIGHT", source: "plaid", cents: 820250 },
        { id: "relay", display_name: "Relay Fuel Wallet", source: "internal_ledger", cents: 1733087 },
      ],
    });
    renderTab();
    await waitFor(() => expect(screen.getByText("Relay Fuel Wallet")).toBeTruthy());
    expect(screen.queryByText("Dreamline Diesel Card")).toBeNull();
    expect(screen.getAllByText("$25,533.37").length).toBeGreaterThan(0);
  });
});
