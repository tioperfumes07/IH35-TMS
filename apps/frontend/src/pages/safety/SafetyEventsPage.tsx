import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSafetyEvent,
  getSafetyEventDetail,
  getSafetyEventKpis,
  listSafetyEventLog,
  listSafetyEventNotes,
  type SafetyEventLogRow,
} from "../../api/safety";
import { Modal } from "../../components/Modal";

type Props = {
  operatingCompanyId: string;
};

type EventDraft = {
  event_type: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "acknowledged" | "closed";
  kpi_bucket: "incidents" | "violations" | "claims" | "commendations";
  subject_type: "driver" | "unit" | "company";
  subject_driver_id: string;
  subject_unit_id: string;
  title: string;
  description: string;
};

const INITIAL_DRAFT: EventDraft = {
  event_type: "incident",
  severity: "medium",
  status: "open",
  kpi_bucket: "incidents",
  subject_type: "company",
  subject_driver_id: "",
  subject_unit_id: "",
  title: "",
  description: "",
};

export function SafetyEventsPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"" | "open" | "acknowledged" | "closed">("open");
  const [severityFilter, setSeverityFilter] = useState<"" | "low" | "medium" | "high" | "critical">("");
  const [search, setSearch] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [draft, setDraft] = useState<EventDraft>(INITIAL_DRAFT);

  const eventsQuery = useQuery({
    queryKey: ["safety", "events-v2", operatingCompanyId, statusFilter, severityFilter, search],
    queryFn: () =>
      listSafetyEventLog(operatingCompanyId, {
        status: statusFilter || undefined,
        severity: severityFilter || undefined,
        search: search.trim() || undefined,
      }).then((result) => result.events),
    enabled: Boolean(operatingCompanyId),
  });

  const kpiQuery = useQuery({
    queryKey: ["safety", "events-v2", "kpis", operatingCompanyId],
    queryFn: () => getSafetyEventKpis(operatingCompanyId).then((result) => result.kpis),
    enabled: Boolean(operatingCompanyId),
  });

  const detailQuery = useQuery({
    queryKey: ["safety", "events-v2", "detail", selectedEventId, operatingCompanyId],
    queryFn: () => getSafetyEventDetail(String(selectedEventId), operatingCompanyId).then((result) => result.event),
    enabled: Boolean(selectedEventId && operatingCompanyId),
  });

  const notesQuery = useQuery({
    queryKey: ["safety", "events-v2", "notes", selectedEventId, operatingCompanyId],
    queryFn: () => listSafetyEventNotes(String(selectedEventId), operatingCompanyId).then((result) => result.notes),
    enabled: Boolean(selectedEventId && operatingCompanyId),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        operating_company_id: operatingCompanyId,
        event_type: draft.event_type,
        severity: draft.severity,
        status: draft.status,
        kpi_bucket: draft.kpi_bucket,
        subject_type: draft.subject_type,
        subject_driver_id: draft.subject_driver_id.trim() || undefined,
        subject_unit_id: draft.subject_unit_id.trim() || undefined,
        title: draft.title.trim(),
        description: draft.description.trim() || undefined,
      };
      return createSafetyEvent(payload);
    },
    onSuccess: () => {
      setLogModalOpen(false);
      setDraft(INITIAL_DRAFT);
      void queryClient.invalidateQueries({ queryKey: ["safety", "events-v2", operatingCompanyId] });
    },
  });

  const rows = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
  const logModalDirty =
    draft.title.trim() !== INITIAL_DRAFT.title.trim() ||
    draft.event_type.trim() !== INITIAL_DRAFT.event_type.trim() ||
    draft.description.trim() !== INITIAL_DRAFT.description.trim() ||
    draft.subject_driver_id.trim() !== INITIAL_DRAFT.subject_driver_id.trim() ||
    draft.subject_unit_id.trim() !== INITIAL_DRAFT.subject_unit_id.trim() ||
    draft.severity !== INITIAL_DRAFT.severity ||
    draft.status !== INITIAL_DRAFT.status ||
    draft.kpi_bucket !== INITIAL_DRAFT.kpi_bucket ||
    draft.subject_type !== INITIAL_DRAFT.subject_type;

  const closeLogModal = () => {
    setLogModalOpen(false);
    setDraft(INITIAL_DRAFT);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total events" value={Number(kpiQuery.data?.total ?? 0)} />
        <KpiCard label="Open" value={Number(kpiQuery.data?.open_count ?? 0)} />
        <KpiCard label="Severe" value={Number(kpiQuery.data?.severe_count ?? 0)} />
        <KpiCard label="Commendations" value={Number(kpiQuery.data?.commendations_count ?? 0)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 bg-white p-2">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "" | "open" | "acknowledged" | "closed")}
            className="rounded border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={severityFilter}
            onChange={(event) => setSeverityFilter(event.target.value as "" | "low" | "medium" | "high" | "critical")}
            className="rounded border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="">All severity</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title or description"
            className="w-56 rounded border border-gray-300 px-2 py-1 text-xs"
          />
        </div>

        <button
          type="button"
          onClick={() => setLogModalOpen(true)}
          className="rounded bg-blue-700 px-3 py-1 text-xs font-semibold text-white"
        >
          + Log Event
        </button>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-[980px] w-full text-left text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
            <tr>
              <th className="px-2 py-1">Occurred</th>
              <th className="px-2 py-1">Type</th>
              <th className="px-2 py-1">Severity</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1">Subject</th>
              <th className="px-2 py-1">Title</th>
              <th className="px-2 py-1">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-2 py-1">{String(row.occurred_at ?? "").slice(0, 16).replace("T", " ")}</td>
                <td className="px-2 py-1">{row.event_type}</td>
                <td className="px-2 py-1">{row.severity}</td>
                <td className="px-2 py-1">{row.status}</td>
                <td className="px-2 py-1">{renderSubject(row)}</td>
                <td className="px-2 py-1">{row.title}</td>
                <td className="px-2 py-1">
                  <button type="button" className="text-blue-700 underline" onClick={() => setSelectedEventId(row.id)}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-4 text-center text-gray-500">
                  No safety events found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedEventId ? (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l border-gray-200 bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Safety Event Detail</h3>
            <button type="button" className="text-xs text-gray-500" onClick={() => setSelectedEventId(null)}>
              Close
            </button>
          </div>

          <div className="mt-3 space-y-2 text-xs text-gray-700">
            <div><span className="font-semibold">Title:</span> {detailQuery.data?.title ?? "—"}</div>
            <div><span className="font-semibold">Type:</span> {detailQuery.data?.event_type ?? "—"}</div>
            <div><span className="font-semibold">Severity:</span> {detailQuery.data?.severity ?? "—"}</div>
            <div><span className="font-semibold">Status:</span> {detailQuery.data?.status ?? "—"}</div>
            <div><span className="font-semibold">Occurred:</span> {String(detailQuery.data?.occurred_at ?? "").slice(0, 19).replace("T", " ") || "—"}</div>
            <div><span className="font-semibold">Description:</span> {detailQuery.data?.description ?? "—"}</div>
          </div>

          <div className="mt-4 border-t border-gray-200 pt-3">
            <h4 className="text-xs font-semibold uppercase text-gray-500">Event log notes</h4>
            <div className="mt-2 space-y-2">
              {(notesQuery.data ?? []).map((note) => (
                <div key={note.id} className="rounded border border-gray-200 bg-gray-50 p-2 text-xs">
                  <div className="text-gray-700">{note.note}</div>
                  <div className="mt-1 text-[10px] text-gray-500">
                    {String(note.created_at ?? "").slice(0, 19).replace("T", " ")} · {note.created_by_name ?? note.created_by}
                  </div>
                </div>
              ))}
              {(notesQuery.data ?? []).length === 0 ? <div className="text-xs text-gray-500">No notes yet.</div> : null}
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        open={logModalOpen}
        onClose={closeLogModal}
        title="Log Safety Event"
        confirmDiscardOnClose
        isDirty={logModalDirty}
      >
        <div className="grid gap-2 sm:grid-cols-2" data-testid="safety-event-log-modal">
          <input
            value={draft.title}
            onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Title"
            className="rounded border border-gray-300 px-2 py-1 text-xs sm:col-span-2"
          />
          <input
            value={draft.event_type}
            onChange={(event) => setDraft((prev) => ({ ...prev, event_type: event.target.value }))}
            placeholder="Event type"
            className="rounded border border-gray-300 px-2 py-1 text-xs"
          />
          <select
            value={draft.kpi_bucket}
            onChange={(event) => setDraft((prev) => ({ ...prev, kpi_bucket: event.target.value as EventDraft["kpi_bucket"] }))}
            className="rounded border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="incidents">Incidents</option>
            <option value="violations">Violations</option>
            <option value="claims">Claims</option>
            <option value="commendations">Commendations</option>
          </select>
          <select
            value={draft.severity}
            onChange={(event) => setDraft((prev) => ({ ...prev, severity: event.target.value as EventDraft["severity"] }))}
            className="rounded border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <select
            value={draft.status}
            onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value as EventDraft["status"] }))}
            className="rounded border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={draft.subject_type}
            onChange={(event) => setDraft((prev) => ({ ...prev, subject_type: event.target.value as EventDraft["subject_type"] }))}
            className="rounded border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="company">Company</option>
            <option value="driver">Driver</option>
            <option value="unit">Unit</option>
          </select>
          <input
            value={draft.subject_driver_id}
            onChange={(event) => setDraft((prev) => ({ ...prev, subject_driver_id: event.target.value }))}
            placeholder="Subject driver UUID (optional)"
            className="rounded border border-gray-300 px-2 py-1 text-xs"
          />
          <input
            value={draft.subject_unit_id}
            onChange={(event) => setDraft((prev) => ({ ...prev, subject_unit_id: event.target.value }))}
            placeholder="Subject unit UUID (optional)"
            className="rounded border border-gray-300 px-2 py-1 text-xs"
          />
          <textarea
            value={draft.description}
            onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Description"
            className="rounded border border-gray-300 px-2 py-1 text-xs sm:col-span-2"
            rows={4}
          />
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !draft.title.trim() || !draft.event_type.trim()}
            className="rounded bg-blue-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {createMutation.isPending ? "Saving..." : "Save event"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-gray-200 bg-white px-3 py-2">
      <div className="text-[11px] uppercase text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function renderSubject(row: SafetyEventLogRow) {
  if (row.subject_type === "driver") return row.subject_driver_name || row.subject_driver_id || "Driver";
  if (row.subject_type === "unit") return row.subject_unit_number || row.subject_unit_id || "Unit";
  return "Company";
}
