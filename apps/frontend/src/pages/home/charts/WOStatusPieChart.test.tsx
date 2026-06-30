import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as homeApi from "../../../api/home";
import { formatWoStatusLabel } from "../../../lib/chartLegend";
import { WOStatusPieChart } from "./WOStatusPieChart";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-pie">{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => null,
  Cell: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

function wrap(ui: ReactElement) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("WOStatusPieChart", () => {
  it("renders PieChart with five status buckets", async () => {
    vi.spyOn(homeApi, "fetchHomeWoStatusCounts").mockResolvedValue([
      { status: "draft", count: 1 },
      { status: "open", count: 1 },
      { status: "in_progress", count: 1 },
      { status: "completed", count: 1 },
      { status: "cancelled", count: 1 },
    ]);
    render(wrap(<WOStatusPieChart operatingCompanyId="c1" />));
    await waitFor(() => expect(screen.getByTestId("pie-chart")).toBeInTheDocument());
  });

  it("formats missing legend labels as Unknown", () => {
    expect(formatWoStatusLabel(undefined)).toBe("Unknown");
    expect(formatWoStatusLabel("")).toBe("Unknown");
    expect(formatWoStatusLabel("in_progress")).toBe("in progress");
  });
});
