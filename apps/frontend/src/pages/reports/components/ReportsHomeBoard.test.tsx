// Register row 53 (11-03) — Reports Home IS the v3 board (docs/design/v3/Reports.dc.html): KPI strip + category
// sidebar + one right panel, nothing stacked below; every catalog row is a real anchor to its route.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ReportsHomeBoard, reportCatalogHref } from "./ReportsHomeBoard";

vi.mock("../../../api/reports", () => ({
  getKpiSummary: vi.fn(async () => ({ available_reports: 20, scheduled: 6, run_last_7d: 0, ifta_status: null })),
  getFrequentlyRun: vi.fn(async () => []),
  getIftaStatus: vi.fn(async () => ({ currentQuarter: "Q3", nextDueAt: "2026-10-31T00:00:00Z", daysUntilDue: 10 })),
}));
vi.mock("../ScheduledReportsPanel", () => ({ ScheduledReportsPanel: () => <div data-testid="scheduled-panel-stub" /> }));
vi.mock("../../../components/reports/IftaPreparerCard", () => ({ IftaPreparerCard: () => <div data-testid="ifta-card-stub" /> }));

function renderBoard(initialEntry = "/reports") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <ReportsHomeBoard companyId="usmca" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("row 53 — Reports Home is exactly the board", () => {
  it("renders the 4 KPI tiles and the category sidebar, with no layered section below the board", async () => {
    renderBoard();
    for (const id of ["reports-kpi-available", "reports-kpi-schedules", "reports-kpi-run-7d", "reports-kpi-ifta"]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.getByTestId("reports-category-nav")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("reports-kpi-available").textContent).toContain("20"));
    // The legacy layers are gone from the Financial view.
    expect(screen.queryByTestId("reports-home-management")).toBeNull();
    expect(screen.queryByTestId("reports-home-frequently-run")).toBeNull();
    expect(screen.queryByTestId("ifta-card-stub")).toBeNull();
  });

  it("catalog rows are anchors to their routes, not buttons", () => {
    renderBoard();
    const tb = screen.getByTestId("reports-acct-link-trial-balance");
    expect(tb.tagName).toBe("A");
    expect(tb.getAttribute("href") ?? "").toContain("/reports/trial-balance?basis=accrual");
    expect(tb.getAttribute("href") ?? "").toContain("ret=");
    expect(screen.getByTestId("reports-acct-run-profit-per-truck").getAttribute("href") ?? "").toContain(
      "/reports/profit-per-truck",
    );
    const table = screen.getByTestId("reports-home-accounting-financial");
    expect(within(table).queryAllByRole("button", { name: /Run →|Trial balance/ })).toHaveLength(0);
  });

  it("View all keeps every catalog report reachable, including the 4 board reports and the Management compilations", () => {
    renderBoard();
    fireEvent.click(screen.getByText("View all →"));
    for (const key of ["driver-settlements-report", "company-settlements-report", "customer-report", "vendor-report", "scheduled-reports"]) {
      expect(screen.getByTestId(`reports-acct-link-${key}`).tagName).toBe("A");
    }
    expect(screen.getByTestId("reports-acct-link-management-company-overview").getAttribute("href") ?? "").toContain(
      "/reports/management?type=company-overview",
    );
  });

  it("Operations lists the 5 report boards (PR #28529) as links; Saved holds Frequently run; Compliance holds the IFTA preparer", async () => {
    renderBoard();
    fireEvent.click(screen.getByRole("button", { name: "Operations" }));
    expect(screen.getByTestId("reports-category-link-loads-report").getAttribute("href")).toBe("/reports/loads");
    expect(screen.getByTestId("reports-category-link-vendor-report").getAttribute("href")).toBe("/reports/vendors");
    fireEvent.click(screen.getByRole("button", { name: "Saved" }));
    expect(screen.getByTestId("reports-home-frequently-run")).toBeTruthy();
    expect(screen.getByTestId("reports-saved-builder-link").getAttribute("href")).toBe("/reports/custom");
    fireEvent.click(screen.getByRole("button", { name: "Compliance" }));
    await waitFor(() => expect(screen.getByTestId("ifta-card-stub")).toBeTruthy());
  });

  it("ROUND 8.20 board25 — Available / Run-7d KPIs are interactive and write ?cat=", async () => {
    renderBoard("/reports?basis=cash");
    fireEvent.click(screen.getByTestId("reports-kpi-run-7d"));
    await waitFor(() => expect(screen.getByTestId("reports-home-frequently-run")).toBeTruthy());
    fireEvent.click(screen.getByTestId("reports-kpi-available"));
    await waitFor(() => expect(screen.getByTestId("reports-home-accounting-financial")).toBeTruthy());
  });

  it("reportCatalogHref resolves basis-aware, plain and management rows", () => {
    expect(reportCatalogHref("balance-sheet", "cash")).toBe("/reports/balance-sheet?basis=cash");
    expect(reportCatalogHref("fuel-reconciliation", "cash")).toBe("/reports/fuel-reconciliation");
    expect(reportCatalogHref("management-sales-performance", "accrual")).toBe("/reports/management?type=sales-performance");
    expect(reportCatalogHref("no-such-report", "accrual")).toBeNull();
  });

  it("reportCatalogHref attaches ret so TB Back restores Home Cash", () => {
    const href = reportCatalogHref("trial-balance", "cash", "/reports?basis=cash") ?? "";
    expect(href).toContain("/reports/trial-balance?");
    expect(href).toContain("basis=cash");
    expect(href).toContain("ret=");
    const ret = new URLSearchParams(href.split("?")[1] ?? "").get("ret") ?? "";
    expect(decodeURIComponent(ret)).toBe("/reports?basis=cash");
  });
});
