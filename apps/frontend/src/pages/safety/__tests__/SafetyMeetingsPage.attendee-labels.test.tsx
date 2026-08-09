import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as mdataApi from "../../../api/mdata";
import * as safetyApi from "../../../api/safety";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../../components/Toast";
import { SafetyMeetingsPage } from "../SafetyMeetingsPage";

/**
 * SAF-B24-residual: SafetyMeetingsPage's attendance panel and the create-modal's required-attendee
 * chip list both rendered `<EntityLink kind="driver" id={driverId} />` with NO label — required
 * attendees / attendance keys are bare driver uuids living in an event_log description JSON blob
 * (no joined driver-name column), so the raw uuid was the link text. Fixed by resolving names
 * client-side via a listDrivers() lookup.
 *
 * Isolated in its own file (not SafetyMeetingsTraining.test.tsx): that file's userEvent.setup()
 * calls throw in this environment (pre-existing, confirmed identical on an unmodified checkout),
 * and once jsdom's document is torn down by that failure every subsequent test in the same file
 * fails too. This file never touches userEvent, only fireEvent, so it stays isolated from that.
 */

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: companyId }),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("SafetyMeetingsPage attendee name resolution (SAF-B24-residual)", () => {
  beforeEach(() => {
    vi.spyOn(safetyApi, "listSafetyMeetings").mockResolvedValue({
      meetings: [
        {
          id: "meeting-1",
          operating_company_id: companyId,
          event_type: "safety_meeting",
          severity: "low",
          status: "open",
          kpi_bucket: "commendations",
          subject_type: "company",
          subject_driver_id: null,
          subject_unit_id: null,
          related_load_id: null,
          occurred_at: "2026-06-01T12:00:00Z",
          title: "Monthly safety briefing",
          description: JSON.stringify({ required_attendees: ["driver-1"], attendance: {} }),
          created_by: "user-1",
          created_at: "2026-06-01T12:00:00Z",
          location_text: null,
          injury_count: 0,
          fatality_count: 0,
          tow_away_required: false,
          dot_reportable: false,
          police_report_number: null,
          required_attendees: ["driver-1"],
          attendance: {},
        },
      ],
    });
    vi.spyOn(safetyApi, "createSafetyMeeting").mockResolvedValue({ event: { id: "meeting-2" } } as never);
    vi.spyOn(safetyApi, "syncSafetyMeetingAttendance").mockResolvedValue({ event: { id: "att-1" } } as never);
    vi.spyOn(mdataApi, "listDrivers").mockResolvedValue({
      total: 0,
      drivers: [{ id: "driver-1", first_name: "Alex", last_name: "Driver", status: "Active" } as never],
    });
  });

  it("shows the driver's resolved name in the attendance panel, not the raw uuid", async () => {
    render(wrap(<SafetyMeetingsPage operatingCompanyId={companyId} />));
    fireEvent.click(await screen.findByTestId("safety-meeting-attendance-btn-meeting-1"));
    const panel = await screen.findByTestId("safety-meeting-attendance-panel");
    expect(panel.textContent).toContain("Alex Driver");
    expect(panel.textContent).not.toContain("driver-1");
  });
});
