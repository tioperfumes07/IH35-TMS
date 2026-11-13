// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDaysIso } from "../../../lib/businessDate";
import { getRollingLedger } from "../../../api/cashFlow";
import { DailyPredictionTab } from "./DailyPredictionTab";

function LocationProbe() {
  const { search } = useLocation();
  return <div data-testid="location-search">{search}</div>;
}

vi.mock("../../../lib/businessDate", async (original) => ({
  ...(await original<typeof import("../../../lib/businessDate")>()),
  companyToday: () => "2026-11-11",
}));
vi.mock("../../../api/cashFlow", () => ({
  getRollingLedger: vi.fn(),
  addCashFlowAdjustment: vi.fn(),
  archiveCashFlowAdjustment: vi.fn(),
}));

const companyId = "11111111-1111-4111-8111-111111111111";
function mount(entry = "/cash-flow?tab=daily_prediction") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/cash-flow"
            element={
              <>
                <DailyPredictionTab operatingCompanyId={companyId} />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Projected date selection uses one coherent calendar window", () => {
  beforeEach(() => {
    vi.mocked(getRollingLedger).mockImplementation(async (_company, from, to) => ({
      from, to, opening_cash_cents: 10000, rows: [],
      days: Array.from({ length: 14 }, (_, i) => ({
        date: addDaysIso(from, i), income_due_cents: Number(addDaysIso(from, i).slice(-2)) * 100, expenses_due_cents: 0,
        income_carry_over_cents: 0, expenses_carry_over_cents: 0,
        net_cents: Number(addDaysIso(from, i).slice(-2)) * 100,
        running_cash_cents: 10000 + Array.from({ length: i + 1 }, (_, j) => Number(addDaysIso(from, j).slice(-2)) * 100).reduce((a, b) => a + b, 0),
      })),
    }));
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("fetches Monday before showing a full week entered on Wednesday", async () => {
    const user = userEvent.setup(); mount();
    await waitFor(() => expect(getRollingLedger).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /^Week$/ }));
    await waitFor(() => expect(getRollingLedger).toHaveBeenLastCalledWith(companyId, "2026-11-09", "2026-11-22"));
    expect(screen.getByTestId("cash-flow-projected-nav").textContent).toContain("11/09/2026 – 11/15/2026");
    expect(await screen.findByRole("button", { name: /Mon 11\/09\/2026/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sun 11\/15\/2026/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Mon 11\/16\/2026/ })).toBeNull();
    expect(screen.getByTestId("cash-flow-projected-formula").textContent).toContain("+$84.00");
    expect(screen.getByTestId("cash-flow-projected-formula").textContent).toContain("$184.00");
  });

  it("a weekly day tile drills to that day, and returning to Week restores Monday", async () => {
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole("button", { name: /^Week$/ }));
    await user.click(await screen.findByRole("button", { name: /Thu 11\/12\/2026/ }));
    expect(screen.getByTestId("cash-flow-projected-nav").textContent).toContain("11/12/2026");
    expect(screen.getByRole("button", { name: "Previous day" })).toBeTruthy();
    await waitFor(() => expect(getRollingLedger).toHaveBeenLastCalledWith(companyId, "2026-11-12", "2026-11-25"));
    await waitFor(() => expect(screen.getByTestId("cash-flow-projected-formula").textContent).toContain("+$12.00"));
    expect(screen.getByTestId("cash-flow-projected-formula").textContent).toContain("$112.00");
    await user.click(screen.getByRole("button", { name: /^Week$/ }));
    await waitFor(() => expect(getRollingLedger).toHaveBeenLastCalledWith(companyId, "2026-11-09", "2026-11-22"));
    expect(screen.getByTestId("cash-flow-projected-nav").textContent).toContain("11/09/2026 – 11/15/2026");
    await waitFor(() => expect(screen.getByTestId("cash-flow-projected-formula").textContent).toContain("+$84.00"));
  });

  // ROUND 8.20 board5 — URL is source of truth for Projected week so settlement ret restores origin.
  it("hydrates week/date from proj_date + proj_grain and writes them when Week is selected", async () => {
    const user = userEvent.setup();
    mount("/cash-flow?tab=daily_prediction&proj_date=2026-11-12&proj_grain=week");
    await waitFor(() => expect(getRollingLedger).toHaveBeenCalled());
    expect(screen.getByTestId("cash-flow-projected-nav").textContent).toContain("11/09/2026 – 11/15/2026");
    await user.click(screen.getByRole("button", { name: /^Day$/ }));
    await waitFor(() => expect(getRollingLedger).toHaveBeenLastCalledWith(companyId, "2026-11-12", "2026-11-25"));
    expect(screen.getByTestId("cash-flow-projected-nav").textContent).toContain("11/12/2026");
  });

  it("stamps proj_date into the URL on bare Projected open so EntityLink ret can restore week", async () => {
    mount("/cash-flow?tab=daily_prediction");
    await waitFor(() => expect(screen.getByTestId("location-search").textContent).toContain("proj_date=2026-11-11"));
    expect(screen.getByTestId("location-search").textContent).toContain("tab=daily_prediction");
  });
});
