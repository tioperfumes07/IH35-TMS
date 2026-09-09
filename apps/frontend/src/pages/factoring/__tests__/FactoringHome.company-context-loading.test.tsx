import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { FactoringHomePage } from "../FactoringHome";
import { ToastProvider } from "../../../components/Toast";

/**
 * FACTORING-HARD-NAV-LOSES-COMPANY-CONTEXT (owner mega-report 2026-09-09): a cold/direct
 * navigation into any factoring route (fresh tab, bookmark, hard refresh) rendered "Select an
 * operating company..." even while CompanyContext's own listMyCompanies() query was still
 * resolving -- companyId was legitimately still loading, not genuinely absent, but the old guard
 * only checked `!companyId` and never the context's own `isLoading`. Read as the whole module
 * (every deep-linked factoring sub-tab renders through this same component) being "missing".
 */

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: null, isLoading: true }),
}));

vi.mock("../../../auth/useAuth", () => ({
  useAuth: () => ({ user: { role: "Owner" } }),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("FactoringHomePage while CompanyContext is still resolving (cold/direct navigation)", () => {
  it("renders a real loading state, not the 'select a company' empty state", () => {
    wrap(<FactoringHomePage />);
    expect(screen.getByTestId("factoring-home-loading")).toBeTruthy();
    expect(screen.queryByTestId("factoring-home-need-company")).toBeNull();
  });
});
