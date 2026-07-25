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
    vi.spyOn(homeApi, "fetchHomeWoStatusCountsDetailed").mockResolvedValue({
      counts: [
        { status: "draft", count: 1 },
        { status: "open", count: 1 },
        { status: "in_progress", count: 1 },
        { status: "completed", count: 1 },
        { status: "cancelled", count: 1 },
      ],
      linked_economics: { status: "unverifiable", unverifiable_reason: "test_stub" },
    });
    render(wrap(<WOStatusPieChart operatingCompanyId="c1" />));
    await waitFor(() => expect(screen.getByTestId("pie-chart")).toBeInTheDocument());
  });

  // ACCT-R-07 (0280-42-wo-to-expense-flow): the widget must surface the join result — a real
  // linked-bill/expense total, not a silently swallowed $0 — proving the accounting join renders.
  it("renders linked bill/expense totals from the accounting join", async () => {
    vi.spyOn(homeApi, "fetchHomeWoStatusCountsDetailed").mockResolvedValue({
      counts: [{ status: "completed", count: 2 }],
      linked_economics: {
        status: "ok",
        buckets: {
          draft: { bill_count: 0, bill_amount_cents: 0, expense_count: 0, expense_amount_cents: 0 },
          open: { bill_count: 0, bill_amount_cents: 0, expense_count: 0, expense_amount_cents: 0 },
          in_progress: { bill_count: 0, bill_amount_cents: 0, expense_count: 0, expense_amount_cents: 0 },
          awaiting_parts: { bill_count: 0, bill_amount_cents: 0, expense_count: 0, expense_amount_cents: 0 },
          completed: { bill_count: 1, bill_amount_cents: 12345, expense_count: 1, expense_amount_cents: 6789 },
          cancelled: { bill_count: 0, bill_amount_cents: 0, expense_count: 0, expense_amount_cents: 0 },
          unknown: { bill_count: 0, bill_amount_cents: 0, expense_count: 0, expense_amount_cents: 0 },
        },
        wo_with_expense_flow_count: 2,
        total_linked_bill_amount_cents: 12345,
        total_linked_expense_amount_cents: 6789,
      },
    });
    render(wrap(<WOStatusPieChart operatingCompanyId="c1" />));
    await waitFor(() => expect(screen.getByText(/Linked bills \$123\.45/)).toBeInTheDocument());
    expect(screen.getByText(/linked expenses \$67\.89/)).toBeInTheDocument();
    expect(screen.getByText(/2 WOs with accounting activity/)).toBeInTheDocument();
  });

  it("formats missing legend labels as Unknown", () => {
    expect(formatWoStatusLabel(undefined)).toBe("Unknown");
    expect(formatWoStatusLabel("")).toBe("Unknown");
    expect(formatWoStatusLabel("in_progress")).toBe("in progress");
  });
});
