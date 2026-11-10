import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDaysIso } from "../../../lib/businessDate";
import { getRollingLedger } from "../../../api/cashFlow";
import { DailyPredictionTab } from "./DailyPredictionTab";

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
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter>
    <DailyPredictionTab operatingCompanyId={companyId} />
  </MemoryRouter></QueryClientProvider>);
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
    await user.click(screen.getByRole("button", { name: "Week", exact: true }));
    await waitFor(() => expect(getRollingLedger).toHaveBeenLastCalledWith(companyId, "2026-11-09", "2026-11-22"));
    expect(screen.getByTestId("cash-flow-projected-nav")).toHaveTextContent("11/09/2026 – 11/15/2026");
    expect(await screen.findByRole("button", { name: /Mon 11\/09\/2026/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Sun 11\/15\/2026/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Mon 11\/16\/2026/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("cash-flow-projected-formula")).toHaveTextContent("+$84.00");
    expect(screen.getByTestId("cash-flow-projected-formula")).toHaveTextContent("$184.00");
  });

  it("a weekly day tile drills to that day, and returning to Week restores Monday", async () => {
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole("button", { name: "Week", exact: true }));
    await user.click(await screen.findByRole("button", { name: /Thu 11\/12\/2026/ }));
    expect(screen.getByTestId("cash-flow-projected-nav")).toHaveTextContent("11/12/2026");
    expect(screen.getByRole("button", { name: "Previous day" })).toBeVisible();
    await waitFor(() => expect(getRollingLedger).toHaveBeenLastCalledWith(companyId, "2026-11-12", "2026-11-25"));
    await waitFor(() => expect(screen.getByTestId("cash-flow-projected-formula")).toHaveTextContent("+$12.00"));
    expect(screen.getByTestId("cash-flow-projected-formula")).toHaveTextContent("$112.00");
    await user.click(screen.getByRole("button", { name: "Week", exact: true }));
    await waitFor(() => expect(getRollingLedger).toHaveBeenLastCalledWith(companyId, "2026-11-09", "2026-11-22"));
    expect(screen.getByTestId("cash-flow-projected-nav")).toHaveTextContent("11/09/2026 – 11/15/2026");
    await waitFor(() => expect(screen.getByTestId("cash-flow-projected-formula")).toHaveTextContent("+$84.00"));
  });
});
