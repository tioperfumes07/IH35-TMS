import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IdvrPage } from "../IdvrPage";

vi.mock("../../../api/safety", () => ({
  getSafetyDvirSubmissions: vi.fn(async () => ({
    submissions: [
      {
        id: "dvir-1",
        submitted_at: "2026-06-03T10:00:00Z",
        driver_name: "Alex Driver",
        unit_number: "T-101",
        type: "pre_trip",
        defect_count: 1,
        defect_severity: "minor",
        follow_up_wo_id: "wo-1",
      },
    ],
  })),
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe("IdvrPage", () => {
  it("renders office list surface", async () => {
    render(wrap(<IdvrPage operatingCompanyId="11111111-1111-4111-8111-111111111111" />));
    expect(screen.getByTestId("idvr-page")).toBeTruthy();
    expect(screen.getByTestId("idvr-table")).toBeTruthy();
  });

  it("renders filter controls", () => {
    render(wrap(<IdvrPage operatingCompanyId="11111111-1111-4111-8111-111111111111" />));
    expect(screen.getByTestId("idvr-filter-from")).toBeTruthy();
    expect(screen.getByTestId("idvr-filter-driver")).toBeTruthy();
  });
});
