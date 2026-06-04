import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { NotifyPreferencesPage } from "../NotifyPreferencesPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91e0bf0a-133f-4ce8-a734-2586cfa66d96" }),
}));

vi.mock("../../../api/mdata", () => ({
  listCustomers: vi.fn(async () => ({
    customers: [{ id: "cust-1", customer_name: "Acme Freight" }],
  })),
}));

vi.mock("../../../api/dispatch", () => ({
  getCustomerNotifyPreferences: vi.fn(async () => ({
    preferences: {
      customer_id: "cust-1",
      opt_in: true,
      notify_sms: false,
      notify_email: true,
      notify_on_departed: true,
      notify_on_arrived: true,
      notify_on_near_arrival: true,
      notify_on_delayed: true,
    },
  })),
  getCustomerNotifyLog: vi.fn(async () => ({
    entries: [
      {
        id: "log-1",
        load_id: "load-1",
        load_number: "L-100",
        customer_id: "cust-1",
        customer_name: "Acme Freight",
        milestone_type: "arrived",
        channel: "email",
        status: "sent",
        provider_id: "email-abc",
        sent_at: new Date().toISOString(),
      },
    ],
    count: 1,
  })),
  updateCustomerNotifyPreferences: vi.fn(),
  syncCustomerNotify: vi.fn(),
}));

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("NotifyPreferencesPage (B21-D9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders customer ETA notify preferences shell", async () => {
    wrap(<NotifyPreferencesPage />);
    expect(await screen.findByTestId("dispatch-notify-preferences-page")).toBeTruthy();
    expect(screen.getByText("Customer ETA notify")).toBeTruthy();
    expect(screen.getByTestId("notify-sync-button")).toBeTruthy();
  });

  it("shows delivery log with provider confirmation ids", async () => {
    wrap(<NotifyPreferencesPage />);
    expect(await screen.findByTestId("notify-log-log-1")).toBeTruthy();
    expect(screen.getByText("email-abc")).toBeTruthy();
    expect(screen.getByText("sent")).toBeTruthy();
  });
});
