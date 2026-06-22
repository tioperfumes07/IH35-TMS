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

type Props = {
  operatingCompanyId: string;
};

export function SafetyMeetingsPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().slice(0, 10));
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

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs" data-testid="safety-meetings-table">
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Date</th>
              <th className="px-2 py-1 text-left">Topic</th>
              <th className="px-2 py-1 text-left">Required</th>
              <th className="px-2 py-1 text-left">Present</th>
              <th className="px-2 py-1 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {meetings.map((meeting) => {
              const required = meeting.required_attendees ?? [];
              const attendance = meeting.attendance ?? {};
              const presentCount = required.filter((driverId) => attendance[driverId]).length;
              return (
                <tr key={meeting.id} className="border-t border-gray-100" data-testid={`safety-meeting-row-${meeting.id}`}>
                  <td className="px-2 py-1">{String(meeting.occurred_at ?? "").slice(0, 10)}</td>
                  <td className="px-2 py-1">{meeting.title}</td>
                  <td className="px-2 py-1">{required.length}</td>
                  <td className="px-2 py-1">{presentCount}</td>
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      className="text-slate-700 underline"
                      data-testid={`safety-meeting-attendance-btn-${meeting.id}`}
                      onClick={() => setExpandedMeetingId(expandedMeetingId === meeting.id ? null : meeting.id)}
                    >
                      Track attendance
                    </button>
                  </td>
                </tr>
              );
            })}
            {meetings.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-3 text-center text-slate-500">
                  No safety meetings found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

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
