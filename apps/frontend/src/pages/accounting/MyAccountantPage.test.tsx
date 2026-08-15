import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MyAccountantPage } from "./MyAccountantPage";
import * as maApi from "../../api/my-accountant";
import { makeAccountingPeriod } from "../../test-utils/factories";
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
      periods: [makeAccountingPeriod()],
    });

    render(wrap(<MyAccountantPage />));

    await waitFor(() => expect(maApi.getAccountingPeriods).toHaveBeenCalled());
    expect((await screen.findAllByText("FY2026 January")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Income statement for the entity")).toBeTruthy();
    expect(await screen.findByText("Export for CPA")).toBeTruthy();
  });


  // LINK-F5186 (PR #6946) shipped the non-null branch at MyAccountantPage.tsx:80-86 with no
  // coverage -- no fixture anywhere set closing_journal_entry_id to a value, so the drill-through
  // to the real fiscal-year-close JE was never exercised. Asserts the resolved href, not just the
  // label, so a wrong EntityLink kind (which would silently route to /accounting/bills/:id) fails.
  it("drills through to the real closing journal entry when the period resolves one", async () => {
    vi.mocked(flagHook.useFeatureFlag).mockReturnValue({ enabled: true, loading: false, error: null });
    vi.mocked(maApi.getAccountingPeriods).mockResolvedValue({
      periods: [makeAccountingPeriod({ closing_journal_entry_id: "9e1c0f22-4b7a-4d2e-9c31-8a5f6b0d7e44" })],
    });

    render(wrap(<MyAccountantPage />));

    // findByRole("link") -- NOT findByText. EntityLink degrades to a plain <span> when the id is
    // missing or the kind has no mounted route (EntityLink.tsx:656-671), and a text query would
    // pass against that span. Requiring role=link means the drill-through must really be clickable.
    const link = await screen.findByRole("link", { name: "View closing entry →" });
    expect(link.getAttribute("href")).toBe(
      "/accounting/journal-entries/9e1c0f22-4b7a-4d2e-9c31-8a5f6b0d7e44",
    );
    // and the month-close fallback must NOT render when a real JE was resolved
    expect(screen.queryByText("View closing entries →")).toBeNull();
  });
  it("invite-accountant affordance is rendered disabled (no permission write)", async () => {
    vi.mocked(flagHook.useFeatureFlag).mockReturnValue({ enabled: true, loading: false, error: null });
    vi.mocked(maApi.getAccountingPeriods).mockResolvedValue({ periods: [] });

    render(wrap(<MyAccountantPage />));

    const inviteBtn = await screen.findByRole("button", { name: /invite accountant/i });
    expect((inviteBtn as HTMLButtonElement).disabled).toBe(true);
  });
});
