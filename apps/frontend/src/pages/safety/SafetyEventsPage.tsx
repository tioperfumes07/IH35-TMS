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
import { EntityLink } from "../../components/shared/EntityLink";
import { useListState } from "../../components/list-state";
import { useSafetyUiContext } from "./SafetyLayout";
import { SafetyEventsTable } from "./components/SafetyEventsTable";
import { NOT_AVAILABLE_YET } from "../../lib/prodEmptyStateCopy";

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
  location_text: string;
  injury_count: number;
  fatality_count: number;
  tow_away_required: boolean;
  dot_reportable: boolean;
  police_report_number: string;
  title: string;
  description: string;
  /** S-06: user-set time of occurrence (ISO); backend defaults to now() when omitted. */
  occurred_at: string;
};

function defaultOccurredAtIso(): string {
  return new Date().toISOString();
}

/** datetime-local (local wall clock) ↔ ISO with offset for z.string().datetime(). */
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(local: string): string {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return defaultOccurredAtIso();
  return d.toISOString();
}

function initialEventDraft(): EventDraft {
  return {
    event_type: "incident",
    severity: "medium",
    status: "open",
    kpi_bucket: "incidents",
    subject_type: "company",
    subject_driver_id: "",
    subject_unit_id: "",
    location_text: "",
    injury_count: 0,
    fatality_count: 0,
    tow_away_required: false,
    dot_reportable: false,
    police_report_number: "",
    title: "",
    description: "",
    occurred_at: defaultOccurredAtIso(),
  };
}


export function SafetyEventsPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"" | "open" | "acknowledged" | "closed">("open");
  const [severityFilter, setSeverityFilter] = useState<"" | "low" | "medium" | "high" | "critical">("");
  const [search, setSearch] = useState("");
  // S-08 / S-10: driver, unit, and type filters (client-side over the loaded page — the backend
  // events-log endpoint does not accept these params; status/severity/search above are server-side).
  const [driverFilter, setDriverFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [draft, setDraft] = useState<EventDraft>(initialEventDraft);
  const [logDraftBaseline, setLogDraftBaseline] = useState<EventDraft | null>(null);
  // S-04: shared From/To date range from the Safety layout's date-range bar (additive to the existing
  // activity-window toggle), applied here against occurred_at.
  const { fromDate, toDate } = useSafetyUiContext();

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
        location_text: draft.location_text.trim() || undefined,
        injury_count: Number(draft.injury_count) || 0,
        fatality_count: Number(draft.fatality_count) || 0,
        tow_away_required: draft.tow_away_required,
        dot_reportable: draft.dot_reportable,
        police_report_number: draft.police_report_number.trim() || undefined,
        title: draft.title.trim(),
        description: draft.description.trim() || undefined,
        occurred_at: draft.occurred_at,
      };
      return createSafetyEvent(payload);
    },
    onSuccess: () => {
      setLogModalOpen(false);
      setDraft(initialEventDraft());
      setLogDraftBaseline(null);
      void queryClient.invalidateQueries({ queryKey: ["safety", "events-v2", operatingCompanyId] });
    },
  });

  const allRows = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);

  // Distinct event types actually present in the loaded page, so the Type filter never offers a value
  // that yields zero rows — event_type is free text server-side, not a fixed enum.
  const availableTypes = useMemo(
    () => Array.from(new Set(allRows.map((row) => row.event_type).filter(Boolean))).sort(),
    [allRows]
  );

  const rows = useMemo(() => {
    return allRows.filter((row) => {
      if (typeFilter && row.event_type !== typeFilter) return false;
      if (driverFilter) {
        const name = String(row.subject_driver_name ?? row.subject_driver_id ?? "").toLowerCase();
        if (!name.includes(driverFilter.trim().toLowerCase())) return false;
      }
      if (unitFilter) {
        const unit = String(row.subject_unit_number ?? row.subject_unit_id ?? "").toLowerCase();
        if (!unit.includes(unitFilter.trim().toLowerCase())) return false;
      }
      const occurredDate = String(row.occurred_at ?? "").slice(0, 10);
      if (fromDate && occurredDate && occurredDate < fromDate) return false;
      if (toDate && occurredDate && occurredDate > toDate) return false;
      return true;
    });
  }, [allRows, typeFilter, driverFilter, unitFilter, fromDate, toDate]);
  // LIST-EMPTY: each empty message renders only after its own query settles.
  const listState = useListState(eventsQuery, allRows.length === 0);
  // Bulk-select + CSV export table (SafetyEventsTable) — adapt the v2 events-log row shape onto the
  // table's generic field names. Detail remains one click away via the existing side panel.
  const bulkTableRows = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        event_at: row.occurred_at,
        driver_full_name: row.subject_type === "driver" ? row.subject_driver_name || row.subject_driver_id || "" : "",
        unit_display_id: row.subject_type === "unit" ? row.subject_unit_number || row.subject_unit_id || "" : undefined,
        event_type: row.event_type,
        severity: row.severity,
        status: row.status,
        title: row.title,
      })),
    [rows]
  );

  // S-09: plain "export all loaded/filtered rows" CSV — the existing SafetyEventsTable export only
  // covers the checkbox-selected subset.
  const exportAllCsv = () => {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const cols: Array<[string, (row: (typeof bulkTableRows)[number]) => string]> = [
      ["Date", (row) => String(row.event_at ?? "").slice(0, 10)],
      ["Driver", (row) => String(row.driver_full_name ?? "")],
      ["Unit", (row) => String(row.unit_display_id ?? "")],
      ["Type", (row) => String(row.event_type ?? "")],
      ["Severity", (row) => String(row.severity ?? "")],
      ["Status", (row) => String(row.status ?? "")],
      ["Title", (row) => String(row.title ?? "")],
    ];
    const header = cols.map(([label]) => esc(label)).join(",");
    const body = bulkTableRows.map((row) => cols.map(([, get]) => esc(get(row))).join(",")).join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `safety-events-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const notesListState = useListState(notesQuery, (notesQuery.data ?? []).length === 0);
  const logModalDirty = logDraftBaseline
    ? draft.title.trim() !== logDraftBaseline.title.trim() ||
      draft.event_type.trim() !== logDraftBaseline.event_type.trim() ||
      draft.description.trim() !== logDraftBaseline.description.trim() ||
      draft.subject_driver_id.trim() !== logDraftBaseline.subject_driver_id.trim() ||
      draft.subject_unit_id.trim() !== logDraftBaseline.subject_unit_id.trim() ||
      draft.location_text.trim() !== logDraftBaseline.location_text.trim() ||
      draft.injury_count !== logDraftBaseline.injury_count ||
      draft.fatality_count !== logDraftBaseline.fatality_count ||
      draft.tow_away_required !== logDraftBaseline.tow_away_required ||
      draft.dot_reportable !== logDraftBaseline.dot_reportable ||
      draft.police_report_number.trim() !== logDraftBaseline.police_report_number.trim() ||
      draft.severity !== logDraftBaseline.severity ||
      draft.status !== logDraftBaseline.status ||
      draft.kpi_bucket !== logDraftBaseline.kpi_bucket ||
      draft.subject_type !== logDraftBaseline.subject_type ||
      draft.occurred_at !== logDraftBaseline.occurred_at
    : false;

  const openLogModal = () => {
    const baseline = initialEventDraft();
    setDraft(baseline);
    setLogDraftBaseline(baseline);
    setLogModalOpen(true);
  };


  const closeLogModal = () => {
    setLogModalOpen(false);
    setDraft(initialEventDraft());
    setLogDraftBaseline(null);
  };

  return (
    <div className="space-y-3">
      {/* B-A3: Total / Open → statusFilter. Severe = high|critical (no single severity); Commendations
          need kpi_bucket on the list API — honest disabled (do not guess severity=high). */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total events" value={Number(kpiQuery.data?.total ?? 0)} onClick={() => setStatusFilter("")} />
        <KpiCard label="Open" value={Number(kpiQuery.data?.open_count ?? 0)} onClick={() => setStatusFilter("open")} />
        <KpiCard
          label="Severe"
          value={Number(kpiQuery.data?.severe_count ?? 0)}
          disabled
          disabledReason={NOT_AVAILABLE_YET}
        />
        <KpiCard
          label="Commendations"
          value={Number(kpiQuery.data?.commendations_count ?? 0)}
          disabled
          disabledReason={NOT_AVAILABLE_YET}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 bg-white p-2">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "" | "open" | "acknowledged" | "closed")}
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="closed">Closed</option>
          </select>
          <select
            aria-label="Filter by severity"
            value={severityFilter}
            onChange={(event) => setSeverityFilter(event.target.value as "" | "low" | "medium" | "high" | "critical")}
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="">All severity</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <input
            aria-label="Search safety events by title or description"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title or description"
            className="w-56 rounded-sm border border-gray-300 px-2 py-1 text-xs"
          />
          {/* S-10: Type filter — despite TYPE being a visible column, no filter previously existed. */}
          <select
            aria-label="Filter by event type"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
            data-testid="safety-events-type-filter"
          >
            <option value="">All types</option>
            {availableTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          {/* S-08: driver + unit filters — search previously covered only title/description. */}
          <input
            aria-label="Filter by driver"
            value={driverFilter}
            onChange={(event) => setDriverFilter(event.target.value)}
            placeholder="Filter by driver"
            className="w-36 rounded-sm border border-gray-300 px-2 py-1 text-xs"
            data-testid="safety-events-driver-filter"
          />
          <input
            aria-label="Filter by unit"
            value={unitFilter}
            onChange={(event) => setUnitFilter(event.target.value)}
            placeholder="Filter by unit"
            className="w-32 rounded-sm border border-gray-300 px-2 py-1 text-xs"
            data-testid="safety-events-unit-filter"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* S-09: plain CSV export of the currently loaded/filtered rows (no row selection required). */}
          <button
            type="button"
            onClick={exportAllCsv}
            disabled={bulkTableRows.length === 0}
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            data-testid="safety-events-export"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={openLogModal}
            className="rounded-sm bg-[#1F2A44] px-3 py-1 text-xs font-semibold text-white"
          >
            + Log Event
          </button>
        </div>
      </div>

      {listState.isEmpty ? (
        <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
          <table className="min-w-[980px] w-full text-left text-xs">
            <tbody>
              <tr>
                <td className="px-2 py-4 text-center text-gray-500">No safety events found.</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <SafetyEventsTable rows={bulkTableRows} loading={eventsQuery.isPending || eventsQuery.isFetching} onOpenAccident={(row) => setSelectedEventId(String(row.id))} />
      )}

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
            <div><span className="font-semibold">Subject:</span> {detailQuery.data ? renderSubject(detailQuery.data) : "—"}</div>
            <div><span className="font-semibold">Type:</span> {detailQuery.data?.event_type ?? "—"}</div>
            <div><span className="font-semibold">Severity:</span> {detailQuery.data?.severity ?? "—"}</div>
            <div><span className="font-semibold">Status:</span> {detailQuery.data?.status ?? "—"}</div>
            <div><span className="font-semibold">Occurred:</span> {String(detailQuery.data?.occurred_at ?? "").slice(0, 19).replace("T", " ") || "—"}</div>
            <div><span className="font-semibold">Location:</span> {detailQuery.data?.location_text ?? "—"}</div>
            <div><span className="font-semibold">Injuries:</span> {detailQuery.data?.injury_count ?? 0}</div>
            <div><span className="font-semibold">Fatalities:</span> {detailQuery.data?.fatality_count ?? 0}</div>
            <div><span className="font-semibold">Tow-away required:</span> {detailQuery.data?.tow_away_required ? "Yes" : "No"}</div>
            <div><span className="font-semibold">DOT reportable:</span> {detailQuery.data?.dot_reportable ? "Yes" : "No"}</div>
            <div><span className="font-semibold">Police report #:</span> {detailQuery.data?.police_report_number ?? "—"}</div>
            <div>
              <span className="font-semibold">Related load:</span>{" "}
              {detailQuery.data?.related_load_id ? (
                <EntityLink
                  kind="load"
                  id={detailQuery.data.related_load_id}
                  label={detailQuery.data.related_load_number ?? detailQuery.data.related_load_id}
                  data-testid="safety-event-related-load-link"
                />
              ) : (
                "—"
              )}
            </div>
            <div><span className="font-semibold">Description:</span> {detailQuery.data?.description ?? "—"}</div>
          </div>

          <div className="mt-4 border-t border-gray-200 pt-3">
            <h4 className="text-xs font-semibold uppercase text-gray-500">Event log notes</h4>
            <div className="mt-2 space-y-2">
              {(notesQuery.data ?? []).map((note) => (
                <div key={note.id} className="rounded-sm border border-gray-200 bg-gray-50 p-2 text-xs">
                  <div className="text-gray-700">{note.note}</div>
                  <div className="mt-1 text-[10px] text-gray-500">
                    {String(note.created_at ?? "").slice(0, 19).replace("T", " ")} · {note.created_by_name ?? note.created_by}
                  </div>
                </div>
              ))}
              {notesListState.isEmpty ? <div className="text-xs text-gray-500">No notes yet.</div> : null}
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
          <label className="flex flex-col gap-0.5 text-[10px] font-semibold uppercase text-gray-600 sm:col-span-2">
            Time of occurrence
            <input
              type="datetime-local"
              value={toDatetimeLocalValue(draft.occurred_at)}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, occurred_at: fromDatetimeLocalValue(event.target.value) }))
              }
              className="rounded-sm border border-gray-300 px-2 py-1 text-xs font-normal normal-case"
              data-testid="safety-event-occurred-at"
            />
          </label>
          <input
            value={draft.title}
            onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Title"
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs sm:col-span-2"
          />
          <input
            value={draft.event_type}
            onChange={(event) => setDraft((prev) => ({ ...prev, event_type: event.target.value }))}
            placeholder="Event type"
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          />
          <select
            value={draft.kpi_bucket}
            onChange={(event) => setDraft((prev) => ({ ...prev, kpi_bucket: event.target.value as EventDraft["kpi_bucket"] }))}
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="incidents">Incidents</option>
            <option value="violations">Violations</option>
            <option value="claims">Claims</option>
            <option value="commendations">Commendations</option>
          </select>
          <select
            value={draft.severity}
            onChange={(event) => setDraft((prev) => ({ ...prev, severity: event.target.value as EventDraft["severity"] }))}
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <select
            value={draft.status}
            onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value as EventDraft["status"] }))}
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={draft.subject_type}
            onChange={(event) => setDraft((prev) => ({ ...prev, subject_type: event.target.value as EventDraft["subject_type"] }))}
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          >
            <option value="company">Company</option>
            <option value="driver">Driver</option>
            <option value="unit">Unit</option>
          </select>
          <input
            value={draft.subject_driver_id}
            onChange={(event) => setDraft((prev) => ({ ...prev, subject_driver_id: event.target.value }))}
            placeholder="Subject driver UUID (optional)"
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          />
          <input
            value={draft.subject_unit_id}
            onChange={(event) => setDraft((prev) => ({ ...prev, subject_unit_id: event.target.value }))}
            placeholder="Subject unit UUID (optional)"
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          />
          <label className="text-xs font-medium text-gray-700 sm:col-span-2">Location (DOT 390.15)</label>
          <input
            value={draft.location_text}
            onChange={(event) => setDraft((prev) => ({ ...prev, location_text: event.target.value }))}
            placeholder="Location description"
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs sm:col-span-2"
            data-testid="safety-event-location-text"
          />
          <label className="text-xs font-medium text-gray-700" htmlFor="safety-event-injury-count">
            Injuries
          </label>
          <label className="text-xs font-medium text-gray-700" htmlFor="safety-event-fatality-count">
            Fatalities
          </label>
          <input
            id="safety-event-injury-count"
            type="number"
            min={0}
            value={draft.injury_count}
            onChange={(event) => setDraft((prev) => ({ ...prev, injury_count: Number(event.target.value) || 0 }))}
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
            data-testid="safety-event-injury-count"
          />
          <input
            id="safety-event-fatality-count"
            type="number"
            min={0}
            value={draft.fatality_count}
            onChange={(event) => setDraft((prev) => ({ ...prev, fatality_count: Number(event.target.value) || 0 }))}
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
            data-testid="safety-event-fatality-count"
          />
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={draft.tow_away_required}
              onChange={(event) => setDraft((prev) => ({ ...prev, tow_away_required: event.target.checked }))}
              data-testid="safety-event-tow-away-required"
            />
            Tow-away required
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={draft.dot_reportable}
              onChange={(event) => setDraft((prev) => ({ ...prev, dot_reportable: event.target.checked }))}
              data-testid="safety-event-dot-reportable"
            />
            DOT reportable
          </label>
          <label className="text-xs font-medium text-gray-700 sm:col-span-2" htmlFor="safety-event-police-report-number">
            Police report number
          </label>
          <input
            id="safety-event-police-report-number"
            value={draft.police_report_number}
            onChange={(event) => setDraft((prev) => ({ ...prev, police_report_number: event.target.value }))}
            placeholder="Police report number (if any)"
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs sm:col-span-2"
            data-testid="safety-event-police-report-number"
          />
          <textarea
            value={draft.description}
            onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Description"
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs sm:col-span-2"
            rows={4}
          />
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !draft.title.trim() || !draft.event_type.trim()}
            className="rounded-sm bg-[#1F2A44] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
          >
            {createMutation.isPending ? "Saving..." : "Save event"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function KpiCard({
  label,
  value,
  onClick,
  disabled,
  disabledReason,
}: {
  label: string;
  value: number;
  onClick?: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const content = (
    <>
      <div className="text-[11px] uppercase text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-900">{value}</div>
    </>
  );
  if (disabled) {
    return (
      <div
        className="cursor-not-allowed rounded-sm border border-gray-200 bg-white px-3 py-2 opacity-70"
        aria-disabled="true"
        title={disabledReason}
        data-kpi-disabled="true"
      >
        {content}
      </div>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-left transition hover:shadow-xs"
      >
        {content}
      </button>
    );
  }
  return <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">{content}</div>;
}

function renderSubject(row: SafetyEventLogRow) {
  if (row.subject_type === "driver") return row.subject_driver_name || row.subject_driver_id || "Driver";
  if (row.subject_type === "unit") return row.subject_unit_number || row.subject_unit_id || "Unit";
  return "Company";
}
