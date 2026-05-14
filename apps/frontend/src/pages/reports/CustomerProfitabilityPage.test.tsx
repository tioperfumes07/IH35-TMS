import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as reportsApi from "../../api/reports";
import { CustomerProfitabilityPage } from "./CustomerProfitabilityPage";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "00000000-0000-4000-8000-000000000099" }),
}));

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-chart">{children}</div>,
  ComposedChart: ({ children }: { children: React.ReactNode }) => <div data-testid="composed-chart">{children}</div>,
  Bar: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
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

const samplePayload: reportsApi.CustomerProfitabilityResponse = {
  period: { start: "2026-04-01", end: "2026-06-30" },
  totals: {
    revenue_cents: 500_000_00,
    direct_cost_cents: 300_000_00,
    gross_margin_cents: 200_000_00,
    gross_margin_pct: 40,
    customer_count: 1,
  },
  by_customer: [
    {
      customer_id: "c1",
      customer_name: "Acme Freight",
      revenue_cents: 500_000_00,
      direct_cost_cents: 300_000_00,
      gross_margin_cents: 200_000_00,
      gross_margin_pct: 40,
      load_count: 12,
      avg_revenue_per_load_cents: 40_000_00,
      ar_aging_balance_cents: 25_000_00,
      days_since_last_load: 3,
      flags: ["high_margin", "past_due"],
    },
  ],
};

describe("CustomerProfitabilityPage", () => {
  it("renders flag chips for customers", async () => {
    vi.spyOn(reportsApi, "getCustomerProfitability").mockResolvedValue(samplePayload);
    render(wrap(<CustomerProfitabilityPage />));
    await waitFor(() => expect(screen.getByText("Acme Freight")).toBeInTheDocument());
    expect(screen.getByText(/high_margin/i)).toBeInTheDocument();
    expect(screen.getByText(/past_due/i)).toBeInTheDocument();
  });

  it("navigates to customer billing tab on row click", async () => {
    const user = userEvent.setup();
    vi.spyOn(reportsApi, "getCustomerProfitability").mockResolvedValue(samplePayload);
    render(wrap(<CustomerProfitabilityPage />));
    await waitFor(() => expect(screen.getByText("Acme Freight")).toBeInTheDocument());
    await user.click(screen.getByText("Acme Freight"));
    expect(mockNavigate).toHaveBeenCalledWith("/customers/c1?tab=billing");
  });

  it("opens AR aging filtered by customer when A/R cell clicked", async () => {
    const user = userEvent.setup();
    vi.spyOn(reportsApi, "getCustomerProfitability").mockResolvedValue(samplePayload);
    render(wrap(<CustomerProfitabilityPage />));
    await waitFor(() => expect(screen.getByText("Acme Freight")).toBeInTheDocument());
    const arCell = screen.getByText("$25,000.00");
    await user.click(arCell);
    expect(mockNavigate).toHaveBeenCalledWith("/reports/ar-aging?customer_id=c1");
  });
});
