import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeStatementsPanel } from "../PerfumeStatementsPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));

// ROUND L.31 M16: ScentsX statements read the one report engine scoped to ScentsX; an account line opens its register.
const paths: string[] = [];
beforeEach(() => {
  paths.length = 0;
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string) => {
    paths.push(path);
    if (path === "/api/v1/scentsx/company") return { company: { id: "sx1", code: "SCENTSX", legal_name: "ScentsX LLC", short_name: null, company_type: "llc", tax_id: null, accounts: 74, roles: 8, periods: 0, customers_linked: 2, vendors_linked: 30 } };
    if (path.startsWith("/api/v1/accounting/profit-loss")) return { revenue: { lines: [{ account_id: "a4000", account_code: "4000", account_name: "Sales of Goods - Wholesale", account_type: "Income", amount: 150000 }], total: 150000 },
      cogs: { lines: [{ account_id: "a5000", account_code: "5000", account_name: "Cost of Goods Sold", account_type: "CostOfGoodsSold", amount: 90000 }], total: 90000 }, gross_profit: 60000, operating_expenses: { lines: [], total: 0 }, net_income: 60000, basis: "accrual" };
    if (path.startsWith("/api/v1/accounting/balance-sheet")) return { assets: { lines: [], total: 0 }, liabilities: { lines: [], total: 0 }, equity: { lines: [], total: 0, current_year_earnings: 0 }, total_liabilities_and_equity: 0, balanced: true, basis: "accrual" };
    if (path === "/api/v1/scentsx/accounts/a4000/register") return { lines: [{ entry_date: "2026-11-20", memo: "Invoice INV-1", source_transaction_type: "invoice", debit_or_credit: "credit", amount_cents: "150000" }] };
    throw new Error(`unexpected ${path}`);
  });
});
const mount = () => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><PerfumeStatementsPanel /></ToastProvider></QueryClientProvider></MemoryRouter>);

describe("ScentsX financial statements", () => {
  it("P&L from the report engine scoped to ScentsX; a line opens its register; Balance Sheet says balanced", async () => {
    mount();
    expect(await screen.findByText("4000 · Sales of Goods - Wholesale")).toBeTruthy();
    expect(paths.some((p) => p.startsWith("/api/v1/accounting/profit-loss") && p.includes("operating_company_id=sx1"))).toBe(true);
    expect(screen.getAllByText("$600.00").length).toBeGreaterThan(0); // gross profit / net income
    fireEvent.click(screen.getByText("4000 · Sales of Goods - Wholesale"));
    expect(await screen.findByText("Invoice INV-1")).toBeTruthy();
    fireEvent.click(screen.getByTestId("scentsx-st-bs"));
    await waitFor(() => expect(screen.getByTestId("scentsx-st-check").textContent).toMatch(/Balanced: assets = liabilities \+ equity/));
  });
});
