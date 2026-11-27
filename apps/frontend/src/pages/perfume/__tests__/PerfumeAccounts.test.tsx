import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeAccountsPanel, PerfumePriceLevelsPanel } from "../PerfumeAccountsPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// Owner 2026-11-26 20:21 / 20:28 CT: Retail, Wholesale, Distributor, Export Mexico; he approves every credit account.
const level = (id: string, name: string, pct: number | null) => ({ id, name, channel: "wholesale", method: "markup", pct, cost_basis: "avg", floor_pct: null, active: true, sort_order: 10, fixed_prices: 0, customers: 0 });
const acct = { company_id: "co1", company_name: "ZZ Customer", city: null, country: null, account_type: "credit", price_level_id: "l2", price_level: "Wholesale", terms_days: 30,
  credit_limit_cents: 2600000, on_hold: true, hold_reason: "past due", approved_at: "2026-11-27T01:00:00Z", approved_by_email: "jorge@test", review_on: null, tax_number: null,
  resale_certificate: true, notes: null, open_applications: 1, open_orders_cents: 50000 };
const calls: Array<[string, unknown]> = [];
beforeEach(() => {
  calls.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method) calls.push([path, opts.body]);
    if (path === "/api/v1/perfume/price-levels") return { levels: [level("l1", "Retail", null), level("l2", "Wholesale", 20), level("l3", "Distributor", null), level("l4", "Export Mexico", null)] };
    if (path.startsWith("/api/v1/perfume/price-levels/")) return { ok: true, id: "l1" };
    if (path === "/api/v1/perfume/customer-accounts") return { accounts: [acct] };
    if (path === "/api/v1/perfume/credit-applications?status=submitted") return { applications: [{ id: "a1", company_id: "co1", legal_name: "ZZ SA", requested_limit_cents: 3000000, requested_terms_days: 30, status: "submitted", approved_limit_cents: null, approved_terms_days: null, created_at: "2026-11-27T00:00:00Z", decided_at: null, decided_by_email: null }] };
    if (path === "/api/v1/perfume/contacts/co1/account") return { account: acct, events: [], applications: [{ id: "a1", company_id: "co1", legal_name: "ZZ SA", requested_limit_cents: 3000000, requested_terms_days: 30, status: "submitted", approved_limit_cents: null, approved_terms_days: null, created_at: "2026-11-27T00:00:00Z", decided_at: null, decided_by_email: null }] };
    if (path === "/api/v1/perfume/credit-applications/a1/decide") return { ok: true };
    throw new Error(`unexpected ${path}`);
  });
});
const mount = (ui: React.ReactNode) => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>{ui}</ToastProvider></QueryClientProvider></MemoryRouter>);

describe("price levels and customer accounts", () => {
  it("the four levels show; typing a % saves it", async () => {
    mount(<PerfumePriceLevelsPanel />);
    const pct = await screen.findByTestId("perfume-level-pct-Retail");
    fireEvent.change(pct, { target: { value: "35" } });
    fireEvent.blur(pct);
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/perfume/price-levels/l1", { pct: 35 }]));
    expect(screen.getByTestId("perfume-level-pct-Wholesale")).toHaveProperty("value", "20");
  });
  it("accounts: KPIs, a waiting application filters, and approving sends my limit and terms", async () => {
    mount(<PerfumeAccountsPanel />);
    const k = await screen.findByTestId("perfume-accounts-kpis");
    await waitFor(() => expect(within(k).getByText("$26,000.00")).toBeTruthy());
    fireEvent.click(within(k).getByText("Applications waiting for me"));
    fireEvent.click((await screen.findAllByText("ZZ Customer"))[0]!);
    const ed = await screen.findByTestId("perfume-account-editor");
    await waitFor(() => expect(within(ed).getByTestId("perfume-app-approve-a1")).toBeTruthy());
    fireEvent.click(within(ed).getByTestId("perfume-app-approve-a1"));
    await waitFor(() => expect(calls).toContainEqual(["/api/v1/perfume/credit-applications/a1/decide", { decision: "approved", limit_cents: 3000000, terms_days: 30, note: null }]));
    expect(ed.textContent).toContain("On hold: past due");
  });
});
