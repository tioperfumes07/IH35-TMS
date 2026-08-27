import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { ClaimsTab } from "./ClaimsTab";

/**
 * INS-F01 — reproduces the crash that took down the whole Insurance Claims tab.
 *
 * ClaimsTab ran `if (!companyId) return <…/>` and THEN called
 * `useMemo<ParityColumn<InsuranceClaim>[]>(…)` for its column set. On a direct URL load or a refresh
 * the company context is not resolved on the first render, so companyId was "" — the component
 * returned early having run 7 hooks, and the next render, with the context resolved, ran 8. React
 * compares hook counts between renders of the same component and throws error #310, "rendered fewer
 * hooks than expected", crashing the tab.
 *
 * It was reachable ONLY by deep link or refresh: navigating to the tab from inside the app already
 * had the context, which is why normal clicking never hit it and it survived to production.
 *
 * The first render here deliberately has NO company (the unresolved-context state), and the rerender
 * supplies one — the exact transition that changes the hook count. With the guard sitting above the
 * useMemo this test throws; with it below every hook it passes.
 */

// No company on first render — the real unresolved-context state on a deep link.
const companyState = { selectedCompanyId: "" };

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: companyState.selectedCompanyId,
    companies: [],
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: vi.fn(),
    setDefaultCompanyForUser: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../../api/insurance", () => ({
  listInsuranceClaims: vi.fn().mockResolvedValue({ claims: [] }),
  listInsurancePolicies: vi.fn().mockResolvedValue({ policies: [] }),
  getInsuranceClaimGraph: vi.fn().mockResolvedValue(null),
  insuranceClaimsApi: { create: vi.fn() },
}));

vi.mock("../../api/mdata", () => ({
  listUnits: vi.fn().mockResolvedValue({ units: [] }),
  listDrivers: vi.fn().mockResolvedValue({ drivers: [] }),
}));

vi.mock("../../api/loads", () => ({
  listLoads: vi.fn().mockResolvedValue({ loads: [], total_count: 0, has_more: false }),
}));

vi.mock("../../api/safety", () => ({
  getUserPreferences: vi.fn().mockResolvedValue({ preferences: {} }),
  getSafetyAccidents: vi.fn().mockResolvedValue({ accidents: [], total_count: 0 }),
}));

function wrap(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("ClaimsTab hook order (INS-F01)", () => {
  it("survives the no-company -> company transition that a deep link or refresh produces", () => {
    // React logs error #310 through console.error before throwing; capture it so a hook-count
    // violation cannot pass quietly as a console warning.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    companyState.selectedCompanyId = "";
    const { rerender } = render(wrap(<ClaimsTab />));

    // The guard renders instead of the grid — correct behaviour, and it must stay.
    expect(screen.getByText(/Select an operating company to view claims/i)).toBeInTheDocument();

    // Context resolves. Pre-fix this second render ran one MORE hook than the first and React threw.
    companyState.selectedCompanyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
    expect(() => rerender(wrap(<ClaimsTab />))).not.toThrow();

    const hookOrderComplaint = consoleError.mock.calls
      .flat()
      .map((arg) => String(arg))
      .find((msg) => /rendered fewer hooks|Rendered more hooks|change in the order of Hooks|Minified React error #310/i.test(msg));
    expect(hookOrderComplaint, `React reported a hook-order violation: ${hookOrderComplaint}`).toBeUndefined();

    consoleError.mockRestore();
  });
});
