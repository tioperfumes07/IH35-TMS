import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as homeApi from "../../../api/home";
import { WeeklyRevenueChart } from "./WeeklyRevenueChart";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-chart">{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

function wrap(ui: ReactElement) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("WeeklyRevenueChart", () => {
  it("renders LineChart shell with mocked series data", async () => {
    vi.spyOn(homeApi, "fetchHomeWeeklyRevenue").mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => ({
        date: `2026-05-${String(i + 1).padStart(2, "0")}`,
        revenue_cents: 1000,
      }))
    );
    render(wrap(<WeeklyRevenueChart operatingCompanyId="c1" />));
    await waitFor(() => expect(screen.getByTestId("line-chart")).toBeInTheDocument());
    expect(screen.getByTestId("responsive-chart")).toBeInTheDocument();
  });
});
