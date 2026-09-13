import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("AccountingSubNavWrapper back button", () => {
  const originalState = window.history.state;
  afterEach(() => window.history.replaceState(originalState, ""));

  it("renders a back button", () => {
    render(
      wrap(
        <AccountingSubNavWrapper title="Invoices">
          <div>content</div>
        </AccountingSubNavWrapper>,
      ),
    );
    expect(screen.getByLabelText("Back")).toBeInTheDocument();
  });

  it("falls back to /home on a direct load/refresh (idx 0)", () => {
    window.history.replaceState({ idx: 0 }, "");
    render(
      wrap(
        <AccountingSubNavWrapper title="Invoices">
          <div>content</div>
        </AccountingSubNavWrapper>,
      ),
    );
    fireEvent.click(screen.getByLabelText("Back"));
    expect(navigateSpy).toHaveBeenCalledWith("/home");
  });

  it("prefers real history once the user has navigated in-app", () => {
    window.history.replaceState({ idx: 1, key: "def456", usr: null }, "");
    render(
      wrap(
        <AccountingSubNavWrapper title="Invoices">
          <div>content</div>
        </AccountingSubNavWrapper>,
      ),
    );
    fireEvent.click(screen.getByLabelText("Back"));
    expect(navigateSpy).toHaveBeenCalledWith(-1);
    expect(navigateSpy).not.toHaveBeenCalledWith("/home");
  });
});
