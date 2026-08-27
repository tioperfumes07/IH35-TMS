import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import * as safetyApi from "../../../api/safety";
import { IntegrityAlertsPage } from "../IntegrityAlertsPage";

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // MemoryRouter: this page (or a child it gained) calls useLocation, so every render threw
  // "useLocation() may be used only in the context of a <Router> component" before any assertion ran —
  // all three cases died on the harness, not on the page. The app always renders it inside the router.
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("IntegrityAlertsPage (A23-12)", () => {
  beforeEach(() => {
    vi.spyOn(safetyApi, "getIntegrityAlerts").mockResolvedValue({
      integrity_alerts: [
        {
          id: "alert-1",
          alert_category: "driver_mpg_anomaly",
          severity: "warning",
          subject_type: "driver",
          resolution_status: "unresolved",
          created_at: "2026-06-01T12:00:00Z",
          detection_summary: "Fuel MPG anomaly",
        },
      ],
      total_count: 1,
    });
    vi.spyOn(safetyApi, "getIntegrityAlertRules").mockResolvedValue({
      integrity_alert_rules: [
        {
          id: "rule-1",
          rule_code: "fuel_anomaly",
          rule_name: "Fuel MPG anomaly",
          source_view: "safety.v_fuel_mpg_anomalies",
          severity: "warning",
          enabled: true,
        },
      ],
    });
    vi.spyOn(safetyApi, "evaluateIntegrityAlerts").mockResolvedValue({
      rules_scanned: 3,
      events_inserted: 1,
      alerts_inserted: 1,
    });
    vi.spyOn(safetyApi, "acknowledgeIntegrityAlert").mockResolvedValue({ id: "alert-1" });
    vi.spyOn(safetyApi, "snoozeIntegrityAlert").mockResolvedValue({ id: "alert-1" });
  });

  it("renders alerts inbox and opens detail drawer", async () => {
    const user = userEvent.setup();
    render(wrap(<IntegrityAlertsPage operatingCompanyId={companyId} />));
    await waitFor(() => {
      expect(screen.getByTestId("integrity-alerts-page")).toBeTruthy();
      expect(screen.getByText("driver_mpg_anomaly")).toBeTruthy();
    });
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByTestId("integrity-alert-detail-drawer")).toBeTruthy();
  });

  it("shows rules tab with seeded rule", async () => {
    const user = userEvent.setup();
    render(wrap(<IntegrityAlertsPage operatingCompanyId={companyId} />));
    await user.click(screen.getByRole("button", { name: "Rules" }));
    await waitFor(() => {
      expect(screen.getByTestId("integrity-rules-panel")).toBeTruthy();
    });
    expect(screen.getByText("Fuel MPG anomaly")).toBeTruthy();
  });

  it("runs evaluator from inbox toolbar", async () => {
    const user = userEvent.setup();
    render(wrap(<IntegrityAlertsPage operatingCompanyId={companyId} />));
    await user.click(screen.getByRole("button", { name: "Run evaluator" }));
    await waitFor(() => {
      expect(safetyApi.evaluateIntegrityAlerts).toHaveBeenCalledWith(companyId);
    });
  });
});
