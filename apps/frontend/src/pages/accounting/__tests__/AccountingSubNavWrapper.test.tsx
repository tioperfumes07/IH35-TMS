import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountingSubNavWrapper } from "../AccountingSubNavWrapper";

// UI-BACK-BUTTON-MISSING-ENTIRELY: this wrapper is the module header for every one of the ~49
// routed /accounting/* pages and had NO back control at all -- a real systemwide-audit finding,
// distinct from (and additional to) the wrong-destination defect fixed elsewhere. Fallback target
// is /home, the established module-root convention used by SystemModulePage/ComplianceDashboardPage.
const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateSpy };
});

// ALL-SEATS RESEARCH-BEHAVIOR (2026-09-13) — the wrapper now reads live nav-KPI counts/totals for
// its Bills/Invoices labels (useAccountingNavKpis), which needs a company id + a QueryClient.
// This suite is about the back-button, not the KPI feature (that has its own tests) — mock the
// company context to a fixed id and stub the KPI hook to an empty/zero result so these tests stay
// focused on navigation behavior.
vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));
vi.mock("../useAccountingNavKpis", () => ({
  useAccountingNavKpis: () => ({ bills: { count: 0, openAmountCents: 0 }, invoices: { count: 0, openAmountCents: 0 } }),
}));

function wrap(ui: ReactElement) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => navigateSpy.mockClear());

// U18 (owner UI register 2026-10-03) — "Back is browser history — becomes a breadcrumb, parent always the module home".
// The wrapper still gives every Accounting page a visible way back (UI-BACK-BUTTON-MISSING-ENTIRELY), now the breadcrumb.
describe("AccountingSubNavWrapper way back", () => {
  beforeEach(() => navigateSpy.mockClear());

  it("shows Accounting (home link) / [parent] / this page", () => {
    render(
      wrap(
        <AccountingSubNavWrapper title="Recurring Bills" crumbs={[{ label: "Bills", href: "/accounting/bills" }]}>
          <div>content</div>
        </AccountingSubNavWrapper>,
      ),
    );
    const crumb = within(screen.getByTestId("accounting-breadcrumb"));
    expect(crumb.getByRole("link", { name: "Accounting" })).toHaveAttribute("href", "/accounting");
    expect(crumb.getByRole("link", { name: "Bills" })).toHaveAttribute("href", "/accounting/bills");
    expect(crumb.getByText("Recurring Bills")).toBeInTheDocument();
  });

  it("offers no browser-history Back", () => {
    render(
      wrap(
        <AccountingSubNavWrapper title="Invoices">
          <div>content</div>
        </AccountingSubNavWrapper>,
      ),
    );
    expect(screen.queryByLabelText("Back")).toBeNull();
    expect(navigateSpy).not.toHaveBeenCalledWith(-1);
  });
});
