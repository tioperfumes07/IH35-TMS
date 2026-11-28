import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as clientApi from "../../../api/client";
import { ToastProvider } from "../../../components/Toast";
import { PerfumeBooksPanel } from "../PerfumeBooksPanel";

vi.mock("../../../api/client", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../api/client")>()), apiRequest: vi.fn() }));
vi.mock("../../../contexts/CompanyContext", () => ({ useCompanyContext: () => ({ selectedCompanyId: "sx", setSelectedCompany: vi.fn() }) }));
vi.mock("../ScentsxCompliancePanel", () => ({ ScentsxCompliancePanel: () => null }));
vi.mock("../ScentsxDailyReportPanel", () => ({ ScentsxDailyReportPanel: () => null }));
vi.mock("../ScentsxItemAccounts", () => ({ ScentsxItemAccountsBlock: () => null }));

// L.38 CC3 finding: the ScentsX chart showed 1201–1216 / 5001–5016 flat. They ARE sub-accounts of 1200 / 5000 in the books
// (catalogs.accounts.parent_account_id) — the chart now shows them indented with "Sub-account of", the QuickBooks way.
const acct = (id: string, no: string, name: string, type: string, parent: string | null = null) =>
  ({ id, account_number: no, account_name: name, account_type: type, account_subtype: null, roles: [], debit_cents: "0", credit_cents: "0", parent_account_id: parent });
beforeEach(() => {
  vi.mocked(clientApi.apiRequest).mockImplementation(async (path: string) => {
    if (path === "/api/v1/scentsx/company") return { company: { id: "sx", code: "SCENTSX", legal_name: "ScentsX LLC", short_name: "TIO Perfumes", company_type: "distributor", tax_id: null, accounts: 3, roles: 0, periods: 0, customers_linked: 0, vendors_linked: 0 } };
    if (path === "/api/v1/scentsx/accounts") return { accounts: [acct("a1200", "1200", "Inventory", "Asset"), acct("a1205", "1205", "Inventory - Body Mist", "Asset", "a1200"), acct("a5000", "5000", "Cost of Goods Sold", "CostOfGoodsSold")] };
    if (path.startsWith("/api/v1/scentsx/pending-moves")) return { pending: 0, moves: [] };
    throw new Error(`not in this test: ${path}`);
  });
});

describe("ScentsX chart of accounts", () => {
  it("shows a sub-account indented under its parent with 'Sub-account of'", async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><MemoryRouter><PerfumeBooksPanel /></MemoryRouter></ToastProvider></QueryClientProvider>);
    const sub = await screen.findByTestId("scentsx-books-sub-a1205");
    expect(sub.textContent).toContain("Inventory - Body Mist");
    const row = sub.closest("tr")!;
    expect(within(row).getAllByText(/Inventory/).length).toBeGreaterThan(1); // its own name + the parent in "Sub-account of"
    await waitFor(() => expect(screen.queryByTestId("scentsx-books-sub-a1200")).toBeNull()); // a parent is not a sub-account
    expect(screen.getByText("Sub-account of")).toBeTruthy();
  });
});
