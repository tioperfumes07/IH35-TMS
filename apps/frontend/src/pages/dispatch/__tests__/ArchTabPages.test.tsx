import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import * as dispatchApi from "../../../api/dispatch";
import { AtRiskQueuePage } from "../AtRiskQueuePage";
import { InTransitIssuesPage } from "../InTransitIssuesPage";
import { AssignmentHistoryPage } from "../AssignmentHistoryPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("dispatch arch tab pages (B21-D2)", () => {
  beforeEach(() => {
    vi.spyOn(dispatchApi, "listAtRiskDispatchLoads").mockResolvedValue({
      loads: [
        {
          id: "l1",
          load_number: "LD-100",
          status: "in_transit",
          customer_name: "Acme",
          unit_number: "101",
          driver_name: "Jane Driver",
          latest_eta_prediction: { confidence_class: "late_risk" },
          next_stop_scheduled_at: null,
          delivery_city: "Dallas",
          delivery_state: "TX",
        },
      ],
    });
    vi.spyOn(dispatchApi, "listDispatchIntransitIssues").mockResolvedValue({
      issues: [
        {
          id: "i1",
          load_id: "l1",
          driver_id: "d1",
          unit_id: "u1",
          issue_category: "mechanical",
          issue_description: "Check engine light on highway",
          severity: "warning",
          status: "open",
          reported_at: "2026-06-03T12:00:00Z",
          load_number: "LD-100",
          unit_number: "101",
          driver_name: "Jane Driver",
        },
      ],
    });
    vi.spyOn(dispatchApi, "listDispatchAssignmentHistory").mockResolvedValue({
      rows: [
        {
          id: "h1",
          load_id: "l1",
          assignment_method: "quicksave",
          reason_code: "driver_swap",
          notes: null,
          assigned_at: "2026-06-02T10:00:00Z",
          load_number: "LD-100",
          previous_driver_name: "Bob Old",
          new_driver_name: "Jane Driver",
          previous_unit_number: "100",
          new_unit_number: "101",
        },
      ],
    });
  });

  it("renders at-risk queue page with load row", async () => {
    wrap(<AtRiskQueuePage />);
    expect(await screen.findByTestId("dispatch-at-risk-page")).toBeTruthy();
    expect(await screen.findByText("LD-100")).toBeTruthy();
  });

  it("renders in-transit issues page with open issue", async () => {
    wrap(<InTransitIssuesPage />);
    expect(await screen.findByTestId("dispatch-intransit-issues-page")).toBeTruthy();
    expect(await screen.findByText("mechanical")).toBeTruthy();
  });

  it("shows create issue action on in-transit page", async () => {
    wrap(<InTransitIssuesPage />);
    expect(await screen.findByText("+ Create Issue")).toBeTruthy();
  });

  it("renders assignment history page with reassignment row", async () => {
    wrap(<AssignmentHistoryPage />);
    expect(await screen.findByTestId("dispatch-assignment-history-page")).toBeTruthy();
    expect(await screen.findByText("Jane Driver")).toBeTruthy();
  });

  it("shows assignment history filters", async () => {
    wrap(<AssignmentHistoryPage />);
    expect(await screen.findByPlaceholderText("Filter by driver UUID")).toBeTruthy();
  });

  it("lists at-risk loads via dispatch API", async () => {
    wrap(<AtRiskQueuePage />);
    await screen.findByText("LD-100");
    expect(dispatchApi.listAtRiskDispatchLoads).toHaveBeenCalled();
  });
});
