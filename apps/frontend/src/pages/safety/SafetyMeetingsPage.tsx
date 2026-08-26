import { useEffect, useMemo, useRef, useState } from "react";
import { formatDateUS } from "../../lib/formatDate";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSafetyMeeting,
  listSafetyMeetings,
  syncSafetyMeetingAttendance,
  type SafetyMeetingRow,
} from "../../api/safety";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { companyToday } from "../../lib/businessDate";
import { useDriverLabels } from "../../hooks/useDriverLabels";
import { userFacingApiError } from "../../lib/api-error-message";

type Props = {
  operatingCompanyId: string;
};

export function SafetyMeetingsPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [meetingDate, setMeetingDate] = useState(companyToday());
  const [requiredAttendees, setRequiredAttendees] = useState<string[]>([]);
  const [attendeePick, setAttendeePick] = useState<string | null>(null);
  const [expandedMeetingId, setExpandedMeetingId] = useState<string | null>(null);
  const lifecycleGenerationRef = useRef(0);

  const meetingsQuery = useQuery({
    queryKey: ["safety", "meetings", operatingCompanyId],
    queryFn: () => listSafetyMeetings(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const createMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; payload: Parameters<typeof createSafetyMeeting>[1] }) =>
      createSafetyMeeting(input.companyId, input.payload),
    onSuccess: (_result, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      setCreateOpen(false);
      setTopic("");
      setRequiredAttendees([]);
      setAttendeePick(null);
      void queryClient.invalidateQueries({ queryKey: ["safety", "meetings", input.companyId] });
    },
  });

  const attendanceMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; meetingId: string; meetingTitle: string; driverId: string; attended: boolean }) =>
      syncSafetyMeetingAttendance(input.companyId, {
        meeting_id: input.meetingId,
        meeting_title: input.meetingTitle,
        driver_id: input.driverId,
        attended: input.attended,
      }),
    onSuccess: (_result, input) => {
      if (input.generation !== lifecycleGenerationRef.current) return;
      void queryClient.invalidateQueries({ queryKey: ["safety", "meetings", input.companyId] });
    },
  });

  useEffect(() => {
    lifecycleGenerationRef.current += 1;
    createMutation.reset();
    attendanceMutation.reset();
    setCreateOpen(false);
    setTopic("");
    setMeetingDate(companyToday());
    setRequiredAttendees([]);
    setAttendeePick(null);
    setExpandedMeetingId(null);
  }, [operatingCompanyId]); // Mutation reset functions are stable; each company owns fresh meeting state.

  const meetings = meetingsQuery.data?.meetings ?? [];
  const linkedDriverIds = useMemo(
    () => [...new Set([...meetings.flatMap((meeting) => meeting.required_attendees ?? []), ...requiredAttendees])],
    [meetings, requiredAttendees],
  );
  // Reverse labels resolve the exact persisted FKs, including archived drivers; a paged picker
  // roster is never used as a historical-link resolver.
  const { byId: driverNameById } = useDriverLabels(operatingCompanyId, linkedDriverIds);

  const addAttendee = (driverId: string | null) => {
    if (!driverId) {
      setAttendeePick(null);
      return;
    }
    setRequiredAttendees((current) => (current.includes(driverId) ? current : [...current, driverId]));
    setAttendeePick(null);
  };

  // Migrated to the shared QBO-parity grid (resize / sticky-header / density / export). Columns,
  // order, and the per-row "Track attendance" action are preserved verbatim (§7 additive-only).
  const meetingColumns: Array<ParityColumn<SafetyMeetingRow>> = [
    { key: "occurred_at", label: "Date", sortable: true, render: (m) => formatDateUS(m.occurred_at) },
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
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 bg-white px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">Safety Meetings</div>
          <div className="text-[11px] text-slate-500">Schedule meetings, track required attendees, and sync attendance to safety events.</div>
        </div>
        <Button size="sm" data-testid="safety-meetings-create-btn" onClick={() => setCreateOpen(true)}>
          + Create Meeting
        </Button>
      </div>

      {/* CLS-LIST-ERROR-STATE-UNGUARDED: a failed query fell through to emptyText "No safety meetings found." — an outage
          presenting as a carrier holding no safety meetings, which is a training-compliance claim. */}
      {meetingsQuery.isError ? (
        <ListErrorState
          title="Couldn't load safety meetings"
          status={0}
          message={(meetingsQuery.error as Error)?.message}
          onRetry={() => void meetingsQuery.refetch()}
        />
      ) : (
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
      )}

      {expandedMeetingId ? (
        <div className="rounded-sm border border-gray-200 bg-white px-3 py-2" data-testid="safety-meeting-attendance-panel">
          {(() => {
            const meeting = meetings.find((row) => row.id === expandedMeetingId);
            if (!meeting) return null;
            const attendeeIds = meeting.required_attendees ?? [];
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
                            companyId: operatingCompanyId,
                            generation: lifecycleGenerationRef.current,
                            meetingId: meeting.id,
                            meetingTitle: meeting.title,
                            driverId,
                            attended: event.target.checked,
                          });
                        }}
                      />
                      <EntityLink
                        kind="driver"
                        id={driverId}
                        label={entityLabel(driverNameById.get(driverId), driverId, "Driver")}
                      />
                    </label>
                  ))}
                  {attendeeIds.length === 0 ? (
                    <div className="text-xs text-slate-500">No required attendees on this meeting.</div>
                  ) : null}
                </div>
                {attendanceMutation.isError ? (
                  <p className="text-xs text-red-700" data-testid="safety-meeting-attendance-error">
                    {userFacingApiError(attendanceMutation.error, "Could not update meeting attendance.")}
                  </p>
                ) : null}
              </div>
            );
          })()}
        </div>
      ) : null}

      <Modal variant="drawer" open={createOpen} onClose={() => setCreateOpen(false)} title="Create Meeting">
        <form
          className="space-y-3"
          data-testid="safety-meeting-create-modal"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate({
              companyId: operatingCompanyId,
              generation: lifecycleGenerationRef.current,
              payload: {
                topic: topic.trim(),
                meeting_date: meetingDate,
                required_attendees: [...requiredAttendees],
              },
            });
          }}
        >
          <div className="block text-xs text-slate-600">
            <label htmlFor="safety-meeting-date">Date</label>
            <DatePicker
              id="safety-meeting-date"
              value={meetingDate}
              onChange={setMeetingDate}
              max={new Date().toISOString().slice(0, 10)}
              className="mt-1 block w-full"
              data-testid="safety-meeting-date"
            />
          </div>
          <label className="block text-xs text-slate-600">
            Topic
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              className="mt-1 block h-8 w-full rounded-sm border border-gray-200 px-2 text-xs"
              data-testid="safety-meeting-topic"
              required
            />
          </label>
          <div>
            <div className="text-xs font-semibold text-slate-600">Required attendees</div>
            {/* Picker law: EntityPicker kind=driver — server search; nested create. */}
            <div className="mt-1" data-testid="safety-meeting-driver-search">
              <EntityPicker
                kind="driver"
                operatingCompanyId={operatingCompanyId}
                value={attendeePick}
                onChange={addAttendee}
                nestedInDrawer
                enabled={createOpen}
                placeholder="Search drivers…"
                dataTestId="safety-meeting-driver-picker"
              />
            </div>
            {requiredAttendees.length > 0 ? (
              <ul className="mt-2 space-y-1 rounded-sm border border-gray-200 p-2">
                {requiredAttendees.map((driverId) => (
                  <li
                    key={driverId}
                    className="flex items-center justify-between gap-2 text-xs text-slate-700"
                    data-testid={`safety-meeting-required-${driverId}`}
                  >
                    <EntityLink
                      kind="driver"
                      id={driverId}
                      label={entityLabel(driverNameById.get(driverId), driverId, "Driver")}
                    />
                    <button
                      type="button"
                      className="text-slate-600 underline"
                      onClick={() =>
                        setRequiredAttendees((current) => current.filter((id) => id !== driverId))
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {createMutation.isError ? (
            <p className="text-xs text-red-700" data-testid="safety-meeting-create-error">
              {userFacingApiError(createMutation.error, "Could not create the safety meeting.")}
            </p>
          ) : null}
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
