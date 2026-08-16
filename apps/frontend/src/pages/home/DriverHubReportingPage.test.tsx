// @vitest-environment jsdom
// LV-DRIVER-HUB-REPORTING-STALE-NO-LOAD-FK — proves the "By load" table renders real load-linked
// rows (not the old hardcoded "not yet computed" banner) and shows an honest empty state when
// by_load is genuinely empty.
import * as matchers from "@testing-library/jest-dom/matchers";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as reportingApi from "../../api/driverInboxReporting";
import { DriverHubReportingPage } from "./DriverHubReportingPage";

expect.extend(matchers);

vi.mock("../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

vi.mock("../../api/driverInboxReporting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/driverInboxReporting")>();
  return { ...actual, getInboxReporting: vi.fn() };
});

function wrap(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>
  );
}

const baseSummary = {
  total_requests: 1,
  approved: 1,
  denied: 0,
  approval_rate_pct: 100,
  avg_time_to_view_seconds: 60,
  avg_time_to_approve_seconds: 120,
  total_approved_advance_cents: 5000,
};

describe("DriverHubReportingPage by-load section (LV-DRIVER-HUB-REPORTING-STALE-NO-LOAD-FK)", () => {
  it("renders a real by_load row, not the stale not_computed banner", async () => {
    vi.mocked(reportingApi.getInboxReporting).mockResolvedValue({
      from: "2026-08-01",
      to: "2026-08-16",
      summary: baseSummary,
      by_driver: [
        {
          driver_id: "d1",
          driver_name: "Alice Driver",
          total_requests: 1,
          approved: 1,
          denied: 0,
          approval_rate_pct: 100,
          avg_time_to_view_seconds: 60,
          avg_time_to_approve_seconds: 120,
          approved_advance_cents: 5000,
        },
      ],
      by_load: [
        { load_id: "l1", load_number: "L-20260810-0001", total_requests: 1, approved: 1, approved_advance_cents: 5000 },
      ],
      not_computed: [],
    });

    render(wrap(<DriverHubReportingPage />));

    expect(await screen.findByText("L-20260810-0001")).toBeInTheDocument();
    expect(screen.queryByText(/not yet computed/i)).not.toBeInTheDocument();
  });

  it("shows an honest empty state when no request in the period has a load link", async () => {
    vi.mocked(reportingApi.getInboxReporting).mockResolvedValue({
      from: "2026-08-01",
      to: "2026-08-16",
      summary: baseSummary,
      by_driver: [
        {
          driver_id: "d1",
          driver_name: "Alice Driver",
          total_requests: 1,
          approved: 1,
          denied: 0,
          approval_rate_pct: 100,
          avg_time_to_view_seconds: 60,
          avg_time_to_approve_seconds: 120,
          approved_advance_cents: 5000,
        },
      ],
      by_load: [],
      not_computed: [],
    });

    render(wrap(<DriverHubReportingPage />));

    expect(await screen.findByText("No load-linked requests in this period.")).toBeInTheDocument();
  });
});
