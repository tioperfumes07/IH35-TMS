import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSidebarFlyoutItems,
  SIDEBAR_ITEM_META,
} from "../../components/layout/sidebar-config";
import { BreakEvenPage } from "../../pages/finance/BreakEvenPage";
import { FinanceHubPage } from "../../pages/finance/FinanceHubPage";
import { FinanceOverviewPage } from "../../pages/finance/FinanceOverviewPage";
import financeTabsSource from "../../pages/finance/FinanceModuleTabs.tsx?raw";
import { ToastProvider } from "../../components/Toast";

const apiMocks = vi.hoisted(() => ({
  getBreakEvenInputs: vi.fn(),
  getFinanceHubOverview: vi.fn(),
}));

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({
    selectedCompanyId: "00000000-0000-4000-8000-000000000001",
    companies: [],
    selectedCompany: null,
    isLoading: false,
    setSelectedCompany: vi.fn(),
    setDefaultCompanyForUser: vi.fn(),
  }),
}));

vi.mock("../../hooks/useFeatureFlag", () => ({
  useFeatureFlag: () => ({ enabled: false, loading: false, error: null }),
}));

vi.mock("../../api/financeHub", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/financeHub")>();
  return { ...actual, getFinanceHubOverview: apiMocks.getFinanceHubOverview };
});

vi.mock("../../api/financeBreakEven", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/financeBreakEven")>();
  return { ...actual, getBreakEvenInputs: apiMocks.getBreakEvenInputs };
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function testBoundary(page: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        {page}
        <LocationProbe />
      </ToastProvider>
    </QueryClientProvider>
  );
}

function createFinanceLandingTestRoutes() {
  return [
    <Route
      key="finance-hub-canonical"
      path="/finance"
      element={testBoundary(<FinanceHubPage />)}
    />,
    <Route
      key="finance-overview"
      path="/finance/overview"
      element={testBoundary(<FinanceOverviewPage />)}
    />,
    <Route
      key="finance-hub-legacy"
      path="/finance/hub"
      element={testBoundary(<FinanceHubPage />)}
    />,
  ];
}

function renderFinanceRoute(path: string, includeBreakEven = false) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {createFinanceLandingTestRoutes()}
        {includeBreakEven ? (
          <Route
            path="/finance/break-even"
            element={testBoundary(<BreakEvenPage />)}
          />
        ) : null}
      </Routes>
    </MemoryRouter>,
  );
}

function expectFinanceTabState(activeName: "Hub" | "Overview", inactiveName: "Hub" | "Overview") {
  // The Finance tabs are NavyPageSubNav links; exactly one is current (Hub -> /finance must not stay current on
  // /finance/overview just because it is a path prefix — ROUND 441.6).
  const nav = screen.getByTestId("navy-page-subnav");
  const activeTab = within(nav).getByRole("link", { name: activeName });
  const inactiveTab = within(nav).getByRole("link", { name: inactiveName });

  expect(activeTab).toHaveAttribute("aria-current", "page");
  expect(activeTab).toHaveClass("font-semibold");
  expect(inactiveTab).not.toHaveAttribute("aria-current");
  expect(inactiveTab).not.toHaveClass("font-semibold");
  expect(within(nav).getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page")).toHaveLength(1);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("FIN-2 Finance landing", () => {
  it("renders FinanceHubPage at the canonical /finance entry", async () => {
    renderFinanceRoute("/finance");

    expect(await screen.findByRole("heading", { name: "Finance Hub" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Finance Overview" })).not.toBeInTheDocument();
    expectFinanceTabState("Hub", "Overview");
    expect(screen.getByTestId("location")).toHaveTextContent("/finance");
    expect(apiMocks.getFinanceHubOverview).not.toHaveBeenCalled();
  });

  it("renders FinanceOverviewPage at /finance/overview", async () => {
    renderFinanceRoute("/finance/overview");

    expect(await screen.findByRole("heading", { name: "Finance Overview", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Finance Hub" })).not.toBeInTheDocument();
    expectFinanceTabState("Overview", "Hub");
    expect(screen.getByTestId("location")).toHaveTextContent("/finance/overview");
  });

  it("keeps /finance/hub compatible, active, and free of redirects", async () => {
    renderFinanceRoute("/finance/hub");

    expect(await screen.findByRole("heading", { name: "Finance Hub" })).toBeInTheDocument();
    expectFinanceTabState("Hub", "Overview");
    expect(screen.getByTestId("location")).toHaveTextContent("/finance/hub");
    expect(apiMocks.getFinanceHubOverview).not.toHaveBeenCalled();
  });

  it("returns from Break-Even to Finance Overview", async () => {
    const user = userEvent.setup();
    renderFinanceRoute("/finance/break-even", true);

    expect(await screen.findByRole("heading", { name: "Break-Even Analysis" })).toBeInTheDocument();
    expect(apiMocks.getBreakEvenInputs).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Finance Overview", level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/finance/overview");
  });

  it("sends sidebar and module-tab navigation to the matching surfaces", () => {
    expect(SIDEBAR_ITEM_META.finance.to).toBe("/finance");

    const flyout = getSidebarFlyoutItems("finance", "Owner");
    expect(flyout).toEqual(expect.arrayContaining([
      { label: "Hub", to: "/finance" },
      { label: "Overview", to: "/finance/overview" },
    ]));

    expect(financeTabsSource).toMatch(
      /id:\s*"hub",\s*label:\s*"Hub",\s*to:\s*"\/finance"/,
    );
    expect(financeTabsSource).toMatch(
      /id:\s*"overview",\s*label:\s*"Overview",\s*to:\s*"\/finance\/overview"/,
    );
  });
});
