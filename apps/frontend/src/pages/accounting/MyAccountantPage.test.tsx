import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MyAccountantPage } from "./MyAccountantPage";
import * as maApi from "../../api/my-accountant";
import * as flagHook from "../../hooks/useFeatureFlag";

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91e0bf0a-133f-4ce8-a734-2586cfa66d96" }),
}));

vi.mock("../../api/my-accountant", async () => {
  const actual = await vi.importActual<typeof import("../../api/my-accountant")>("../../api/my-accountant");
  return { ...actual, getAccountingPeriods: vi.fn() };
});

vi.mock("../../hooks/useFeatureFlag", () => ({
  useFeatureFlag: vi.fn(),
}));

function wrap(ui: ReactElement) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        {ui}
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("MyAccountantPage", () => {
  afterEach(cleanup);

  it("shows the disabled state when MY_ACCOUNTANT_ENABLED is off (no data fetch)", async () => {
    vi.mocked(flagHook.useFeatureFlag).mockReturnValue({ enabled: false, loading: false, error: null });

    render(wrap(<MyAccountantPage />));

    expect(await screen.findByText(/not yet enabled/i)).toBeTruthy();
    expect(maApi.getAccountingPeriods).not.toHaveBeenCalled();
  });

  it("renders period status, report links, and CPA export when the flag is enabled", async () => {
    vi.mocked(flagHook.useFeatureFlag).mockReturnValue({ enabled: true, loading: false, error: null });
    vi.mocked(maApi.getAccountingPeriods).mockResolvedValue({
      periods: [
        {
          id: "p1",
          period_label: "FY2026 January",
          period_start: "2026-01-01",
          period_end: "2026-01-31",
          fiscal_year: 2026,
          status: "closed",
          closed_at: "2026-02-05",
        },
      ],
    });

    render(wrap(<MyAccountantPage />));

    await waitFor(() => expect(maApi.getAccountingPeriods).toHaveBeenCalled());
    expect((await screen.findAllByText("FY2026 January")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Income statement for the entity")).toBeTruthy();
    expect(await screen.findByText("Export for CPA")).toBeTruthy();
  });

  it("invite-accountant affordance is rendered disabled (no permission write)", async () => {
    vi.mocked(flagHook.useFeatureFlag).mockReturnValue({ enabled: true, loading: false, error: null });
    vi.mocked(maApi.getAccountingPeriods).mockResolvedValue({ periods: [] });

    render(wrap(<MyAccountantPage />));

    const inviteBtn = await screen.findByRole("button", { name: /invite accountant/i });
    expect((inviteBtn as HTMLButtonElement).disabled).toBe(true);
  });
});
