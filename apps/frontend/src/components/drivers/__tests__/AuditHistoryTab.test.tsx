// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as auditApi from "../../../api/audit";
import { AuditHistoryTab } from "../AuditHistoryTab";

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";
const driverId = "d1111111-1111-4111-8111-111111111111";

function wrap(ui: Parameters<typeof render>[0]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("AuditHistoryTab (A24-6)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(auditApi, "listDriverAuditEvents").mockResolvedValue({
      events: [
        {
          id: "evt-1",
          created_at: "2026-06-04T15:00:00.000Z",
          event_type: "mdata.drivers.updated",
          severity: "info",
          summary: "mdata.drivers.updated: status",
          actor_user_id: "user-1",
          actor_email: "office@ih35.local",
          payload: { changes: { status: { from: "Active", to: "Inactive" } } },
          source: "BT-1-PHASE1-AUDIT",
        },
      ],
      total_count: 1,
      limit: 200,
      offset: 0,
    });
  });

  it("renders live audit table rows", async () => {
    render(wrap(<AuditHistoryTab driverId={driverId} operatingCompanyId={companyId} />));
    expect(await screen.findByTestId("driver-audit-history-tab")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("driver-audit-table")).toBeInTheDocument();
    });
    expect(screen.getByTestId("driver-audit-row-evt-1")).toBeInTheDocument();
    expect(screen.getByTestId("driver-audit-expand-evt-1")).toBeInTheDocument();
  });

  it("expands a row to show payload diff", async () => {
    render(wrap(<AuditHistoryTab driverId={driverId} operatingCompanyId={companyId} />));
    await screen.findByTestId("driver-audit-expand-evt-1");
    fireEvent.click(screen.getByTestId("driver-audit-expand-evt-1"));
    await waitFor(() => {
      expect(screen.getByTestId("driver-audit-diff-evt-1")).toHaveTextContent("status");
    });
  });

  it("shows empty state when no events", async () => {
    vi.spyOn(auditApi, "listDriverAuditEvents").mockResolvedValue({
      events: [],
      total_count: 0,
      limit: 200,
      offset: 0,
    });
    render(wrap(<AuditHistoryTab driverId={driverId} operatingCompanyId={companyId} />));
    expect(await screen.findByTestId("driver-audit-empty")).toBeInTheDocument();
  });
});
