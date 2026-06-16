import type React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as mdataApi from "../../../api/mdata";
import * as safetyApi from "../../../api/safety";
import { ToastProvider } from "../../../components/Toast";
import { SafetyMeetingsPage } from "../SafetyMeetingsPage";
import { TrainingProgramsPage } from "../TrainingProgramsPage";
import { TrainingRecordsPage } from "../TrainingRecordsPage";

const companyId = "91f6d7d8-0f3a-4c2d-8e1b-2c3d4e5f6071";

vi.mock("../../../contexts/CompanyContext", () => ({
  useCompanyContext: () => ({ selectedCompanyId: companyId }),
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("SafetyMeetingsPage", () => {
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

  it("renders meetings and creates a meeting", async () => {
    const user = userEvent.setup();
    render(wrap(<SafetyMeetingsPage operatingCompanyId={companyId} />));
    expect(await screen.findByTestId("safety-meeting-row-meeting-1")).toBeTruthy();
    await user.click(screen.getByTestId("safety-meetings-create-btn"));
    await user.type(screen.getByTestId("safety-meeting-topic"), "Winter driving");
    await user.click(screen.getByTestId("safety-meeting-required-driver-1"));
    await user.click(screen.getByTestId("safety-meeting-submit"));
    await waitFor(() => {
      expect(safetyApi.createSafetyMeeting).toHaveBeenCalledWith(companyId, expect.objectContaining({ topic: "Winter driving" }));
    });
  });

  it("syncs attendance to safety events", async () => {
    const user = userEvent.setup();
    render(wrap(<SafetyMeetingsPage operatingCompanyId={companyId} />));
    await user.click(await screen.findByTestId("safety-meeting-attendance-btn-meeting-1"));
    await user.click(await screen.findByTestId("safety-meeting-attendance-meeting-1-driver-1"));
    await waitFor(() => {
      expect(safetyApi.syncSafetyMeetingAttendance).toHaveBeenCalledWith(
        companyId,
        expect.objectContaining({ meeting_id: "meeting-1", driver_id: "driver-1", attended: true })
      );
    });
  });
});

describe("TrainingProgramsPage", () => {
  beforeEach(() => {
    vi.spyOn(safetyApi, "getTrainingCompletions").mockResolvedValue({
      training_completions: [{ id: "prog-1", training_name: "Defensive Driving", category: "refresher", frequency: "annual" }],
    });
    vi.spyOn(safetyApi, "createTrainingProgram").mockResolvedValue({
      id: "prog-2",
      name: "Hazmat refresh",
      category: "hazmat",
      frequency: "annual",
    });
    vi.spyOn(safetyApi, "createSafetyTrainingRecord").mockResolvedValue({ id: "rec-1" });
    vi.spyOn(mdataApi, "listDrivers").mockResolvedValue({
      total: 0,
      drivers: [{ id: "driver-1", first_name: "Alex", last_name: "Driver", status: "Active" } as never],
    });
  });

  it("creates a training program round-trip", async () => {
    const user = userEvent.setup();
    render(wrap(<TrainingProgramsPage operatingCompanyId={companyId} />));
    expect(await screen.findByTestId("training-program-row-prog-1")).toBeTruthy();
    await user.click(screen.getByTestId("training-programs-create-btn"));
    await user.type(screen.getByTestId("training-program-name"), "Hazmat refresh");
    await user.click(screen.getByTestId("training-program-submit"));
    await waitFor(() => {
      expect(safetyApi.createTrainingProgram).toHaveBeenCalledWith(
        companyId,
        expect.objectContaining({ name: "Hazmat refresh", category: "entry_level" })
      );
    });
  });
});

describe("TrainingRecordsPage", () => {
  beforeEach(() => {
    vi.spyOn(safetyApi, "getTrainingCompletions").mockResolvedValue({
      training_completions: [
        {
          id: "rec-1",
          driver_id: "driver-1",
          training_name: "Defensive Driving",
          completed_at: "2026-05-01T12:00:00Z",
          expiry_date: "2027-05-01",
        },
      ],
    });
    vi.spyOn(safetyApi, "createSafetyTrainingRecord").mockResolvedValue({ id: "rec-2" });
    vi.spyOn(mdataApi, "listDrivers").mockResolvedValue({
      total: 0,
      drivers: [{ id: "driver-1", first_name: "Alex", last_name: "Driver", status: "Active" } as never],
    });
  });

  it("lists records and creates a training record", async () => {
    const user = userEvent.setup();
    render(wrap(<TrainingRecordsPage operatingCompanyId={companyId} />));
    expect(await screen.findByTestId("training-record-row-rec-1")).toBeTruthy();
    await user.click(screen.getByTestId("training-records-create-btn"));
    fireEvent.change(screen.getByTestId("training-record-driver"), { target: { value: "driver-1" } });
    await user.type(screen.getByTestId("training-record-name"), "Cargo securement");
    await user.click(screen.getByTestId("training-record-submit"));
    await waitFor(() => {
      expect(safetyApi.createSafetyTrainingRecord).toHaveBeenCalledWith(
        companyId,
        expect.objectContaining({ driver_id: "driver-1", training_name: "Cargo securement" })
      );
    });
  });
});
