import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSafetyMeeting,
  listSafetyMeetings,
  syncSafetyMeetingAttendance,
  type SafetyMeetingRow,
} from "../../api/safety";
import { listDrivers } from "../../api/mdata";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { companyToday } from "../../lib/businessDate";

type Props = {
  operatingCompanyId: string;
};

export function SafetyMeetingsPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [meetingDate, setMeetingDate] = useState(companyToday());
  const [requiredAttendees, setRequiredAttendees] = useState<string[]>([]);
  const [expandedMeetingId, setExpandedMeetingId] = useState<string | null>(null);

  const meetingsQuery = useQuery({
    queryKey: ["safety", "meetings", operatingCompanyId],
    queryFn: () => listSafetyMeetings(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const driversQuery = useQuery({
    queryKey: ["mdata", "drivers", operatingCompanyId],
    queryFn: () => listDrivers({ operating_company_id: operatingCompanyId, status: "Active" }),
    enabled: Boolean(operatingCompanyId),
  });

  const drivers = driversQuery.data?.drivers ?? [];
  const driverNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const driver of drivers) {
      map.set(driver.id, `${driver.first_name ?? ""} ${driver.last_name ?? ""}`.trim() || driver.id);
    }
    return map;
  }, [drivers]);

  const createMutation = useMutation({
    mutationFn: () =>
      createSafetyMeeting(operatingCompanyId, {
        topic: topic.trim(),
        meeting_date: meetingDate,
        required_attendees: requiredAttendees,
      }),
    onSuccess: () => {
      setCreateOpen(false);
      setTopic("");
      setRequiredAttendees([]);
      void queryClient.invalidateQueries({ queryKey: ["safety", "meetings", operatingCompanyId] });
    },
  });

  const attendanceMutation = useMutation({
    mutationFn: (payload: { meeting: SafetyMeetingRow; driverId: string; attended: boolean }) =>
      syncSafetyMeetingAttendance(operatingCompanyId, {
        meeting_id: payload.meeting.id,
        meeting_title: payload.meeting.title,
        driver_id: payload.driverId,
        attended: payload.attended,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["safety", "meetings", operatingCompanyId] });
    },
  });

  const meetings = meetingsQuery.data?.meetings ?? [];

  const toggleRequiredAttendee = (driverId: string) => {
    setRequiredAttendees((current) =>
      current.includes(driverId) ? current.filter((id) => id !== driverId) : [...current, driverId]
    );
  };

  // Migrated to the shared QBO-parity grid (resize / sticky-header / density / export). Columns,
  // order, and the per-row "Track attendance" action are preserved verbatim (§7 additive-only).
  const meetingColumns: Array<ParityColumn<SafetyMeetingRow>> = [
    { key: "occurred_at", label: "Date", sortable: true, render: (m) => String(m.occurred_at ?? "").slice(0, 10) },
    { key: "title", label: "Topic", sortable: true },
    { key: "required", label: "Required", render: (m) => (m.required_attendees ?? []).length },
    {
      key: "present",
      label: "Present",
      render: (m) => {
        const required = m.required_attendees ?? [];
        const attendance = m.attendance ?? {};
        return required.filter((driverId) => attendance[driverId]).length;
      },
    },
    {
      key: "action",
      label: "Action",
      render: (m) => (
        <button
          type="button"
          className="text-slate-700 underline"
          data-testid={`safety-meeting-attendance-btn-${m.id}`}
          onClick={() => setExpandedMeetingId(expandedMeetingId === m.id ? null : m.id)}
        >
          Track attendance
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-3" data-testid="safety-meetings-page">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 bg-white px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">Safety Meetings</div>
          <div className="text-[11px] text-slate-500">Schedule meetings, track required attendees, and sync attendance to safety events.</div>
        </div>
        <Button size="sm" data-testid="safety-meetings-create-btn" onClick={() => setCreateOpen(true)}>
          + Create Meeting
        </Button>
      </div>

      <ParityTable<SafetyMeetingRow>
        columns={meetingColumns}
        rows={meetings}
        rowKey={(m) => m.id}
        loading={meetingsQuery.isLoading}
        emptyText="No safety meetings found."
        storageKey="safety-meetings"
        exportFilename="safety-meetings"
        tableTestId="safety-meetings-table"
        rowTestId={(m) => `safety-meeting-row-${m.id}`}
      />

      {expandedMeetingId ? (
        <div className="rounded border border-gray-200 bg-white px-3 py-2" data-testid="safety-meeting-attendance-panel">
          {(() => {
            const meeting = meetings.find((row) => row.id === expandedMeetingId);
            if (!meeting) return null;
            const attendeeIds = meeting.required_attendees?.length ? meeting.required_attendees : drivers.map((d) => d.id);
            return (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-700">Attendance — {meeting.title}</div>
                <div className="grid gap-1 md:grid-cols-2">
                  {attendeeIds.map((driverId) => (
                    <label key={driverId} className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(meeting.attendance?.[driverId])}
                        data-testid={`safety-meeting-attendance-${meeting.id}-${driverId}`}
                        onChange={(event) => {
                          attendanceMutation.mutate({
                            meeting,
                            driverId,
                            attended: event.target.checked,
                          });
                        }}
                      />
                      {driverNameById.get(driverId) ?? driverId}
                    </label>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      ) : null}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Meeting">
        <form
          className="space-y-3"
          data-testid="safety-meeting-create-modal"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <label className="block text-xs text-slate-600">
            Date
            <DatePicker
              value={meetingDate}
              onChange={setMeetingDate}
              max={new Date().toISOString().slice(0, 10)}
              className="mt-1 block w-full"
              data-testid="safety-meeting-date"
            />
          </label>
          <label className="block text-xs text-slate-600">
            Topic
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              className="mt-1 block h-8 w-full rounded border border-gray-200 px-2 text-xs"
              data-testid="safety-meeting-topic"
              required
            />
          </label>
          <div>
            <div className="text-xs font-semibold text-slate-600">Required attendees</div>
            <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded border border-gray-200 p-2">
              {drivers.map((driver) => (
                <label key={driver.id} className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={requiredAttendees.includes(driver.id)}
                    data-testid={`safety-meeting-required-${driver.id}`}
                    onChange={() => toggleRequiredAttendee(driver.id)}
                  />
                  {`${driver.first_name ?? ""} ${driver.last_name ?? ""}`.trim() || driver.id}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={createMutation.isPending} data-testid="safety-meeting-submit">
              Create Meeting
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
