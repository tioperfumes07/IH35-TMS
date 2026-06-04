import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as documentAlertsApi from "../../../api/document-alerts";
import { DocumentAlertsPage } from "../DocumentAlertsPage";

const COMPANY = "11111111-1111-4111-8111-111111111111";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: COMPANY }),
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DocumentAlertsPage (A24-9)", () => {
  beforeEach(() => {
    vi.spyOn(documentAlertsApi, "getDocumentAlertsInbox").mockResolvedValue({
      events: [
        {
          id: "e1",
          driver_id: "d1",
          driver_name: "Jane",
          document_type: "cdl",
          source_id: "d1",
          expiry_date: "2026-07-01",
          days_until_expiry: 30,
          detection_summary: "CDL expires in 30 days",
          event_status: "open",
          detected_at: "2026-06-01T12:00:00Z",
          rule_name: "CDL expiration",
          severity: "critical",
        },
      ],
      pending_count: 1,
    });
    vi.spyOn(documentAlertsApi, "getDocumentAlertRules").mockResolvedValue({
      document_alert_rules: [
        {
          id: "r1",
          document_type: "cdl",
          rule_name: "CDL expiration",
          days_before_expiry: [90, 60, 30, 7],
          severity: "critical",
          notify_email: true,
          notify_in_app: true,
          enabled: true,
        },
      ],
    });
    vi.spyOn(documentAlertsApi, "acknowledgeDocumentAlert").mockResolvedValue({ event: { id: "e1" } });
    vi.spyOn(documentAlertsApi, "evaluateDocumentAlerts").mockResolvedValue({
      rules_scanned: 7,
      events_upserted: 0,
      notifications_sent: 0,
    });
    vi.spyOn(documentAlertsApi, "updateDocumentAlertRule").mockResolvedValue({
      document_alert_rule: {
        id: "r1",
        document_type: "cdl",
        rule_name: "CDL expiration",
        days_before_expiry: [90, 60, 30, 7],
        severity: "critical",
        notify_email: true,
        notify_in_app: true,
        enabled: true,
      },
    });
  });

  it("renders inbox with pending alert (A24-9)", async () => {
    render(wrap(<DocumentAlertsPage />));
    expect(await screen.findByTestId("document-alerts-page")).toBeInTheDocument();
    expect(await screen.findByText(/CDL expires in 30 days/i)).toBeInTheDocument();
    expect(screen.getByText(/Inbox \(1\)/i)).toBeInTheDocument();
  });

  it("acknowledges an alert from inbox", async () => {
    const user = userEvent.setup();
    render(wrap(<DocumentAlertsPage />));
    await screen.findByTestId("alert-event-e1");
    await user.click(screen.getByTestId("ack-e1"));
    await waitFor(() =>
      expect(documentAlertsApi.acknowledgeDocumentAlert).toHaveBeenCalledWith(
        "e1",
        COMPANY,
        "Reviewed from alerts inbox"
      )
    );
  });

  it("switches to rules tab and saves thresholds", async () => {
    const user = userEvent.setup();
    render(wrap(<DocumentAlertsPage />));
    await user.click(screen.getByRole("button", { name: /^Rules$/i }));
    await screen.findByTestId("rule-editor-cdl");
    await user.click(screen.getByTestId("save-rule-cdl"));
    await waitFor(() => expect(documentAlertsApi.updateDocumentAlertRule).toHaveBeenCalled());
  });
});
