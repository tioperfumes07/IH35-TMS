import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { DetentionBoardPage } from "../DetentionBoardPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91e0bf0a-133f-4ce8-a734-2586cfa66d96" }),
}));

vi.mock("../../../api/dispatch", () => ({
  getDetentionBoard: vi.fn(async () => ({
    count: 1,
    active_count: 1,
    notify_threshold_minutes: 60,
    events: [
      {
        id: "det-1",
        load_id: "load-1",
        load_number: "L-100",
        customer_name: "Acme",
        stop_city: "Dallas",
        stop_state: "TX",
        stop_type: "delivery",
        driver_name: "Pat Driver",
        status: "accruing",
        started_at: new Date(Date.now() - 90 * 60_000).toISOString(),
        billable_minutes: 30,
        live_accrued_amount_cents: 2500,
        accrued_amount_cents: 0,
        notify_due: false,
        customer_notified_at: null,
      },
    ],
  })),
  syncDetentionFromArrivals: vi.fn(),
  closeDetentionEvent: vi.fn(),
  bridgeDetentionBilling: vi.fn(),
  notifyDetentionCustomer: vi.fn(),
}));

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DetentionBoardPage (B21-D5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders detention board shell", async () => {
    wrap(<DetentionBoardPage />);
    expect(await screen.findByTestId("dispatch-detention-board-page")).toBeTruthy();
    expect(screen.getByText("Detention board")).toBeTruthy();
  });

  it("shows live elapsed timer column for accruing events", async () => {
    wrap(<DetentionBoardPage />);
    expect(await screen.findByTestId("detention-elapsed-det-1")).toBeTruthy();
    expect(screen.getByText("L-100")).toBeTruthy();
  });

  it("exposes sync from arrivals and bridge-oriented actions row", async () => {
    wrap(<DetentionBoardPage />);
    expect(await screen.findByText("Sync from arrivals")).toBeTruthy();
    expect(await screen.findByText("Stop accrual")).toBeTruthy();
    expect(screen.getByText("Accrual")).toBeTruthy();
  });
});
