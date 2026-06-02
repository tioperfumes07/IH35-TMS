import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as complianceApi from "../../../api/compliance";
import { ComplianceDashboardPage } from "../ComplianceDashboardPage";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071" }),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/compliance"]}>
        <Routes>
          <Route path="/compliance" element={<ComplianceDashboardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ComplianceDashboardPage", () => {
  beforeEach(() => {
    vi.spyOn(complianceApi, "fetchComplianceSummary").mockResolvedValue({ red: 1, yellow: 2, green: 3, total: 6 });
    vi.spyOn(complianceApi, "fetchComplianceDashboard").mockResolvedValue({
      credentials: [
        {
          credential_id: "1",
          type: "cdl",
          owner_type: "driver",
          owner_id: "d1",
          owner_name: "Jane Doe",
          label: "CDL",
          expiration_date: "2026-07-01",
          days_until_expiration: 30,
          severity: "yellow",
          action_link: "/drivers/d1/profile",
        },
      ],
    });
    vi.spyOn(complianceApi, "fetchComplianceRules").mockResolvedValue({ rules: [] });
    vi.spyOn(complianceApi, "fetchComplianceLog").mockResolvedValue({ entries: [] });
  });

  it("renders compliance dashboard sections", async () => {
    renderPage();
    expect(await screen.findByTestId("compliance-dashboard-page")).toBeTruthy();
    expect(screen.getByTestId("compliance-section-summary")).toBeTruthy();
    expect(screen.getByTestId("compliance-section-table")).toBeTruthy();
    expect(screen.getByTestId("compliance-section-rules")).toBeTruthy();
    expect(screen.getByTestId("compliance-section-log")).toBeTruthy();
    expect(screen.getByTestId("compliance-summary-cards")).toBeTruthy();
    expect(screen.getByTestId("compliance-table-panel")).toBeTruthy();
  });
});
