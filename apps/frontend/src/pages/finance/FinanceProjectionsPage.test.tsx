import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinanceProjectionsPage } from "./FinanceProjectionsPage";
import * as scenariosApi from "../../api/financeScenarios";
import * as flagHook from "../../hooks/useFeatureFlag";
import { ToastProvider } from "../../components/Toast";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91e0bf0a-133f-4ce8-a734-2586cfa66d96" }),
}));

vi.mock("./FinanceModuleTabs", () => ({ FinanceModuleTabs: () => null }));

vi.mock("../../api/financeScenarios", () => ({
  FINANCE_HUB_SCENARIOS_FLAG: "FINANCE_HUB_SCENARIOS_UI_ENABLED",
  getActiveScenarioSummary: vi.fn(),
  getScenarioDetail: vi.fn(),
}));

vi.mock("../../hooks/useFeatureFlag", () => ({ useFeatureFlag: vi.fn() }));

function wrap(ui: ReactElement) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

const ACTIVE_SUMMARY = {
  summary: { scenario: { id: "22222222-2222-4222-8222-222222222222" } },
};

// GO-0038-FINANCE-PROJECTIONS-DETAIL-QUERY-SILENT-BLANK-PAGE: detailQuery had no isError branch --
// a failed detail fetch (after summaryQuery correctly resolved an active scenario) fell through to
// a bare `null`, rendering only the page header with a silently empty content area, indistinguishable
// from "still loading" or a genuine no-data state.
describe("FinanceProjectionsPage (GO-0038)", () => {
  afterEach(cleanup);

  it("renders scenario detail when both queries succeed", async () => {
    vi.mocked(flagHook.useFeatureFlag).mockReturnValue({ enabled: true, loading: false, error: null });
    vi.mocked(scenariosApi.getActiveScenarioSummary).mockResolvedValue(ACTIVE_SUMMARY as never);
    vi.mocked(scenariosApi.getScenarioDetail).mockResolvedValue({
      scenario: { id: "22222222-2222-4222-8222-222222222222", name: "Q4 Plan", period_basis: "monthly", period_count: 3 },
      lines: [],
    } as never);

    render(wrap(<FinanceProjectionsPage />));

    expect(await screen.findByText("Q4 Plan")).toBeInTheDocument();
  });

  it("shows a visible error + Retry when the scenario-detail fetch fails, never a silently blank page", async () => {
    vi.mocked(flagHook.useFeatureFlag).mockReturnValue({ enabled: true, loading: false, error: null });
    vi.mocked(scenariosApi.getActiveScenarioSummary).mockResolvedValue(ACTIVE_SUMMARY as never);
    vi.mocked(scenariosApi.getScenarioDetail).mockRejectedValue(new Error("network failure"));

    render(wrap(<FinanceProjectionsPage />));

    expect(await screen.findByText("Couldn't load scenario detail")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    // Never silently blank: no stray scenario-detail heading, and the error state is present.
    expect(screen.queryByText("No active scenario yet.")).not.toBeInTheDocument();
  });

  it("retry recovers scenario detail after a prior failure", async () => {
    vi.mocked(flagHook.useFeatureFlag).mockReturnValue({ enabled: true, loading: false, error: null });
    vi.mocked(scenariosApi.getActiveScenarioSummary).mockResolvedValue(ACTIVE_SUMMARY as never);
    vi.mocked(scenariosApi.getScenarioDetail)
      .mockRejectedValueOnce(new Error("network failure"))
      .mockResolvedValueOnce({
        scenario: { id: "22222222-2222-4222-8222-222222222222", name: "Q4 Plan", period_basis: "monthly", period_count: 3 },
        lines: [],
      } as never);

    render(wrap(<FinanceProjectionsPage />));

    const retry = await screen.findByRole("button", { name: /retry/i });
    retry.click();

    await waitFor(() => expect(screen.getByText("Q4 Plan")).toBeInTheDocument());
  });
});
