import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { DateTimePicker } from "../../components/forms/DateTimePicker";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { useListState } from "../../components/list-state";
import { useSafetyUiContext } from "./SafetyLayout";
import { SafetyEventsTable } from "./components/SafetyEventsTable";
import { NOT_AVAILABLE_YET } from "../../lib/prodEmptyStateCopy";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { suggestExpenseLoad } from "../../api/maintenance";
import { LoadSuggestionReadError } from "../../components/shared/LoadSuggestionReadError";
import { Button } from "../../components/Button";
import { useStagedListFilters } from "../../components/table";
import { userFacingApiError } from "../../lib/api-error-message";
import { Combobox } from "../../components/Combobox";
import { companyToday } from "../../lib/businessDate";
import { ListErrorState } from "../../components/ListErrorState";

type Props = {
  operatingCompanyId: string;
};

/** @matrix-built modules=safety cols=driver,unit,load,connectivity,reverse_link */

type EventDraft = {
  event_type: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "acknowledged" | "closed";
  kpi_bucket: "incidents" | "violations" | "claims" | "commendations";
  subject_type: "driver" | "unit" | "company";
  subject_driver_id: string;
  subject_unit_id: string;
  /** FAIL-S1: safety.safety_events.related_load_id exists but the create form never sent it, and the
      table is append-only — so every event ever logged is permanently orphaned from its load. */
  related_load_id: string;
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

const EMPTY_FILTERS = {
  status: "open" as "" | "open" | "acknowledged" | "closed",
  severity: "" as "" | "low" | "medium" | "high" | "critical",
  search: "",
  type: "",
  driverId: "",
  unitId: "",
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
    related_load_id: "",
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
  const companyGenerationRef = useRef(0);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  // C-13 / LST-F106: Safety Home drill links here as /safety/safety-events?event_id=<id>.
  // Detail panel loads via getSafetyEventDetail — no need for the id to be in the current list page.
  const [searchParams, setSearchParams] = useSearchParams();
  const eventIdParam = searchParams.get("event_id");
  const subjectDriverFromUrl = searchParams.get("subject_driver_id")?.trim() ?? "";
  const subjectUnitFromUrl = searchParams.get("subject_unit_id")?.trim() ?? "";
  const relatedLoadFromUrl = searchParams.get("related_load_id")?.trim() ?? "";
  // S-08 / S-10: driver, unit, and type filters (client-side over the loaded page — the backend
  // events-log endpoint does not accept these params; status/severity/search above are server-side).
  // LV-SAFETY-EVENTS-FILTER-SILENT-APPLY — stage until Apply; Cancel restores.
  // filterDraft avoids clashing with create-modal `draft` (EventDraft).
  function patchSearchParam(next: { driverId: string; unitId: string }) {
    const p = new URLSearchParams(searchParams);
    if (next.driverId) p.set("subject_driver_id", next.driverId);
    else p.delete("subject_driver_id");
    if (next.unitId) p.set("subject_unit_id", next.unitId);
    else p.delete("subject_unit_id");
    setSearchParams(p, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    driverId: subjectDriverFromUrl,
    unitId: subjectUnitFromUrl,
  }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      setApplied(next);
      patchSearchParam(next);
    },
  });
  const filterDraft = staged.draft;

  useEffect(() => {
    if (!eventIdParam) return;
    setSelectedEventId(eventIdParam);
    const next = new URLSearchParams(searchParams);
    next.delete("event_id");
    setSearchParams(next, { replace: true });
  }, [eventIdParam, searchParams, setSearchParams]);
  useEffect(() => {
    setApplied((prev) => ({
      ...prev,
      ...(subjectDriverFromUrl ? { driverId: subjectDriverFromUrl } : {}),
      ...(subjectUnitFromUrl ? { unitId: subjectUnitFromUrl } : {}),
    }));
  }, [subjectDriverFromUrl, subjectUnitFromUrl]);

  function setDriverFilter(next: string) {
    staged.setDraft((d) => ({ ...d, driverId: next }));
  }
  function setUnitFilter(next: string) {
    staged.setDraft((d) => ({ ...d, unitId: next }));
  }

  const [logModalOpen, setLogModalOpen] = useState(false);
  const [draft, setDraft] = useState<EventDraft>(initialEventDraft);
  const [logDraftBaseline, setLogDraftBaseline] = useState<EventDraft | null>(null);
  const [suggestionPinned, setSuggestionPinned] = useState(false);
  // S-04: shared From/To date range from the Safety layout's date-range bar (additive to the existing
  // activity-window toggle), applied here against occurred_at.
  const { fromDate, toDate } = useSafetyUiContext();

  const suggestionQuery = useQuery({
    queryKey: [
      "safety",
      "event-create",
      "suggest-load",
      operatingCompanyId,
      draft.subject_driver_id,
      draft.subject_unit_id,
      draft.occurred_at,
    ],
    queryFn: () =>
      suggestExpenseLoad({
        operating_company_id: operatingCompanyId,
        driver_id: draft.subject_driver_id || undefined,
        unit_id: draft.subject_unit_id || undefined,
        transaction_date: draft.occurred_at.slice(0, 10),
      }),
    enabled: Boolean(
      logModalOpen && operatingCompanyId && draft.occurred_at && (draft.subject_driver_id || draft.subject_unit_id)
    ),
  });

  useEffect(() => {
    setSuggestionPinned(false);
  }, [draft.subject_driver_id, draft.subject_unit_id, draft.occurred_at]);

  useEffect(() => {
    if (draft.related_load_id || suggestionPinned) return;
    const suggested = suggestionQuery.data?.data;
    if (!suggested?.load_id) return;
    setDraft((previous) => ({ ...previous, related_load_id: suggested.load_id }));
    setSuggestionPinned(true);
  }, [draft.related_load_id, suggestionPinned, suggestionQuery.data]);

  const eventsQuery = useQuery({
    queryKey: [
      "safety",
      "events-v2",
      operatingCompanyId,
      applied.status,
      applied.severity,
      applied.search,
      applied.driverId,
      applied.unitId,
      relatedLoadFromUrl,
    ],
    queryFn: () =>
      listSafetyEventLog(operatingCompanyId, {
        status: applied.status || undefined,
        severity: applied.severity || undefined,
        search: applied.search.trim() || undefined,
        subject_driver_id: applied.driverId || undefined,
        subject_unit_id: applied.unitId || undefined,
        related_load_id: relatedLoadFromUrl || undefined,
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
    mutationFn: async (input: { companyId: string; generation: number; draft: EventDraft }) => {
      const payload = {
        operating_company_id: input.companyId,
        event_type: input.draft.event_type,
        severity: input.draft.severity,
        status: input.draft.status,
        kpi_bucket: input.draft.kpi_bucket,
        subject_type: input.draft.subject_type,
        subject_driver_id: input.draft.subject_driver_id.trim() || undefined,
        subject_unit_id: input.draft.subject_unit_id.trim() || undefined,
        related_load_id: input.draft.related_load_id.trim() || undefined,
        location_text: input.draft.location_text.trim() || undefined,
        injury_count: Number(input.draft.injury_count) || 0,
        fatality_count: Number(input.draft.fatality_count) || 0,
        tow_away_required: input.draft.tow_away_required,
        dot_reportable: input.draft.dot_reportable,
        police_report_number: input.draft.police_report_number.trim() || undefined,
        title: input.draft.title.trim(),
        description: input.draft.description.trim() || undefined,
        occurred_at: input.draft.occurred_at,
      };
      return createSafetyEvent(payload);
    },
    onSuccess: (_result, input) => {
      if (input.generation !== companyGenerationRef.current) return;
      setLogModalOpen(false);
      setDraft(initialEventDraft());
      setLogDraftBaseline(null);
      void queryClient.invalidateQueries({ queryKey: ["safety", "events-v2", input.companyId] });
    },
  });

  useEffect(() => {
    companyGenerationRef.current += 1;
    createMutation.reset();
    setSelectedEventId(null);
    setLogModalOpen(false);
    setDraft(initialEventDraft());
    setLogDraftBaseline(null);
    setSuggestionPinned(false);
  }, [operatingCompanyId]);

  const allRows = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);

  // Distinct event types actually present in the loaded page, so the Type filter never offers a value
  // that yields zero rows — event_type is free text server-side, not a fixed enum.
  const availableTypes = useMemo(
    () => Array.from(new Set(allRows.map((row) => row.event_type).filter(Boolean))).sort(),
    [allRows]
  );

  const rows = useMemo(() => {
    return allRows.filter((row) => {
      if (applied.type && row.event_type !== applied.type) return false;
      // SAF-F28: picker sets canonical id; keep name/number substring fallback for legacy typed text.
      if (applied.driverId) {
        const id = String(row.subject_driver_id ?? "");
        const name = String(row.subject_driver_name ?? "").toLowerCase();
        const needle = applied.driverId.trim().toLowerCase();
        if (id !== applied.driverId && !name.includes(needle) && id.toLowerCase() !== needle) return false;
      }
      if (applied.unitId) {
        const id = String(row.subject_unit_id ?? "");
        const num = String(row.subject_unit_number ?? "").toLowerCase();
        const needle = applied.unitId.trim().toLowerCase();
        if (id !== applied.unitId && !num.includes(needle) && id.toLowerCase() !== needle) return false;
      }
      const occurredDate = String(row.occurred_at ?? "").slice(0, 10);
      if (fromDate && occurredDate && occurredDate < fromDate) return false;
      if (toDate && occurredDate && occurredDate > toDate) return false;
      return true;
    });
  }, [allRows, applied.type, applied.driverId, applied.unitId, fromDate, toDate]);

  // LV-SAFETY-EVENT-DETAIL-FALLBACK: the list already owns the complete event projection. Keep the
  // drawer meaningful while the exact detail request settles (or if that request fails transiently)
  // instead of replacing a populated row with an all-dash panel.
  const selectedEvent = useMemo(
    () => detailQuery.data ?? allRows.find((row) => String(row.id) === selectedEventId) ?? null,
    [detailQuery.data, allRows, selectedEventId],
  );
  // Bulk-select + CSV export table (SafetyEventsTable) — adapt the v2 events-log row shape onto the
  // table's generic field names. Detail remains one click away via the existing side panel.
  const bulkTableRows = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        event_at: row.occurred_at,
        driver_id: row.subject_driver_id || null,
        driver_full_name: row.subject_driver_name || "",
        unit_id: row.subject_unit_id || null,
        unit_display_id: row.subject_unit_number || "",
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
      ["Driver", (row) => entityLabel(row.driver_full_name, String(row.driver_id ?? ""), "Driver")],
      ["Unit", (row) => entityLabel(row.unit_display_id, String(row.unit_id ?? ""), "Unit")],
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
    a.download = `safety-events-${companyToday()}.csv`;
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
      draft.related_load_id.trim() !== logDraftBaseline.related_load_id.trim() ||
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
      {/* B-A3: Total / Open → applied.status (immediate KPI drill). Severe = high|critical (no single severity); Commendations
          need kpi_bucket on the list API — honest disabled (do not guess severity=high). */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total events"
          value={kpiQuery.isError ? "—" : Number(kpiQuery.data?.total ?? 0)}
          onClick={() => setApplied((prev) => ({ ...prev, status: "" }))}
        />
        <KpiCard
          label="Open"
          value={kpiQuery.isError ? "—" : Number(kpiQuery.data?.open_count ?? 0)}
          onClick={() => setApplied((prev) => ({ ...prev, status: "open" }))}
        />
        <KpiCard
          label="Severe"
          value={kpiQuery.isError ? "—" : Number(kpiQuery.data?.severe_count ?? 0)}
          disabled
          disabledReason={NOT_AVAILABLE_YET}
        />
        <KpiCard
          label="Commendations"
          value={kpiQuery.isError ? "—" : Number(kpiQuery.data?.commendations_count ?? 0)}
          disabled
          disabledReason={NOT_AVAILABLE_YET}
        />
      </div>

      {kpiQuery.isError ? (
        <div data-testid="safety-events-kpi-error">
          <ListErrorState
            title="Couldn't load Safety event totals"
            status={0}
            message={userFacingApiError(kpiQuery.error, "Safety event totals are unavailable.")}
            onRetry={() => void kpiQuery.refetch()}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 bg-white p-2">
        <div className="relative flex flex-wrap items-end gap-2" data-testid="safety-events-filters">
          <Combobox
            id="safety-events-status-filter"
            className="w-36"
            options={[
              { value: "open", label: "Open" },
              { value: "acknowledged", label: "Acknowledged" },
              { value: "closed", label: "Closed" },
            ]}
            value={filterDraft.status}
            onChange={(next) =>
              staged.setDraft((d) => ({
                ...d,
                status: (next ?? "") as "" | "open" | "acknowledged" | "closed",
              }))
            }
            placeholder="All statuses"
            allowClear
          />
          <Combobox
            id="safety-events-severity-filter"
            className="w-36"
            options={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
              { value: "critical", label: "Critical" },
            ]}
            value={filterDraft.severity}
            onChange={(next) =>
              staged.setDraft((d) => ({
                ...d,
                severity: (next ?? "") as "" | "low" | "medium" | "high" | "critical",
              }))
            }
            placeholder="All severity"
            allowClear
          />
          <input
            aria-label="Search safety events by title or description"
            value={filterDraft.search}
            onChange={(event) => staged.setDraft((d) => ({ ...d, search: event.target.value }))}
            placeholder="Search title or description"
            className="w-56 rounded-sm border border-gray-300 px-2 py-1 text-xs"
          />
          {/* S-10: Type filter — despite TYPE being a visible column, no filter previously existed. */}
          <Combobox
            id="safety-events-type-filter"
            dataTestId="safety-events-type-filter"
            className="w-40"
            options={availableTypes.map((type) => ({ value: type, label: type }))}
            value={filterDraft.type}
            onChange={(next) => staged.setDraft((d) => ({ ...d, type: next ?? "" }))}
            placeholder="All types"
            allowClear
          />
          {/* SAF-F28: filters, not creators — allowCreate={false} (Idvr / Accidents law). */}
          <label className="text-[11px] text-slate-600" aria-label="Filter by driver">
            Driver
            <EntityPicker
              kind="driver"
              operatingCompanyId={operatingCompanyId}
              value={filterDraft.driverId || null}
              onChange={(next) => setDriverFilter(next ?? "")}
              allowCreate={false}
              placeholder="All drivers"
              className="mt-1 w-48"
              dataField="safety-events-driver-filter"
              dataTestId="safety-events-driver-filter"
            />
          </label>
          <label className="text-[11px] text-slate-600" aria-label="Filter by unit">
            Unit
            <EntityPicker
              kind="unit"
              operatingCompanyId={operatingCompanyId}
              value={filterDraft.unitId || null}
              onChange={(next) => setUnitFilter(next ?? "")}
              allowCreate={false}
              placeholder="All units"
              className="mt-1 w-40"
              dataField="safety-events-unit-filter"
              dataTestId="safety-events-unit-filter"
            />
          </label>
          <Button type="button" size="sm" data-testid="safety-events-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
            Apply
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-testid="safety-events-filter-cancel"
            onClick={staged.cancel}
            disabled={!staged.dirty}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-testid="safety-events-filter-reset"
            onClick={() => {
              staged.cancel();
              setApplied(EMPTY_FILTERS);
              patchSearchParam(EMPTY_FILTERS);
            }}
          >
            Reset
          </Button>
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

      {eventsQuery.isError ? (
        <div data-testid="safety-events-list-error">
          <ListErrorState
            title="Couldn't load Safety events"
            status={0}
            message={userFacingApiError(eventsQuery.error, "The Safety event list is unavailable.")}
            onRetry={() => void eventsQuery.refetch()}
          />
        </div>
      ) : (
        <SafetyEventsTable
          rows={bulkTableRows}
          loading={eventsQuery.isPending || eventsQuery.isFetching}
          onOpenAccident={(row) => setSelectedEventId(String(row.id))}
        />
      )}

      {selectedEventId ? (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l border-gray-200 bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Safety Event Detail</h3>
            <button type="button" className="text-xs text-gray-500" onClick={() => setSelectedEventId(null)}>
              Close
            </button>
          </div>

          {detailQuery.isError ? (
            <div className="mt-3" data-testid="safety-event-detail-error">
              <ListErrorState
                title="Couldn't refresh Safety event details"
                status={0}
                message={userFacingApiError(detailQuery.error, "Showing the list snapshot while the exact detail is unavailable.")}
                onRetry={() => void detailQuery.refetch()}
              />
            </div>
          ) : null}

          <div className="mt-3 space-y-2 text-xs text-gray-700">
            <div><span className="font-semibold">Title:</span> {selectedEvent?.title ?? "—"}</div>
            <div><span className="font-semibold">Subject:</span> {selectedEvent ? renderSubject(selectedEvent) : "—"}</div>
            <div><span className="font-semibold">Type:</span> {selectedEvent?.event_type ?? "—"}</div>
            <div><span className="font-semibold">Severity:</span> {selectedEvent?.severity ?? "—"}</div>
            <div><span className="font-semibold">Status:</span> {selectedEvent?.status ?? "—"}</div>
            <div><span className="font-semibold">Occurred:</span> {String(selectedEvent?.occurred_at ?? "").slice(0, 19).replace("T", " ") || "—"}</div>
            <div><span className="font-semibold">Location:</span> {selectedEvent?.location_text ?? "—"}</div>
            <div><span className="font-semibold">Injuries:</span> {selectedEvent?.injury_count ?? 0}</div>
            <div><span className="font-semibold">Fatalities:</span> {selectedEvent?.fatality_count ?? 0}</div>
            <div><span className="font-semibold">Tow-away required:</span> {selectedEvent?.tow_away_required ? "Yes" : "No"}</div>
            <div><span className="font-semibold">DOT reportable:</span> {selectedEvent?.dot_reportable ? "Yes" : "No"}</div>
            <div><span className="font-semibold">Police report #:</span> {selectedEvent?.police_report_number ?? "—"}</div>
            <div>
              <span className="font-semibold">Related load:</span>{" "}
              {selectedEvent?.related_load_id ? (
                <EntityLink
                  kind="load"
                  id={selectedEvent.related_load_id}
                  label={entityLabel(selectedEvent.related_load_number, selectedEvent.related_load_id, "Load")}
                  data-testid="safety-event-related-load-link"
                />
              ) : (
                "—"
              )}
            </div>
            <div><span className="font-semibold">Description:</span> {selectedEvent?.description ?? "—"}</div>
          </div>

          <div className="mt-4 border-t border-gray-200 pt-3">
            <h4 className="text-xs font-semibold uppercase text-gray-500">Event log notes</h4>
            <div className="mt-2 space-y-2">
              {notesQuery.isError ? (
                <div data-testid="safety-event-notes-error">
                  <ListErrorState
                    title="Couldn't load event notes"
                    status={0}
                    message={userFacingApiError(notesQuery.error, "Event notes are unavailable.")}
                    onRetry={() => void notesQuery.refetch()}
                  />
                </div>
              ) : (
                <>
                  {(notesQuery.data ?? []).map((note) => (
                    <div key={note.id} className="rounded-sm border border-gray-200 bg-gray-50 p-2 text-xs">
                      <div className="text-gray-700">{note.note}</div>
                      <div className="mt-1 text-[10px] text-gray-500">
                        {String(note.created_at ?? "").slice(0, 19).replace("T", " ")} · {note.created_by_name ?? note.created_by}
                      </div>
                    </div>
                  ))}
                  {notesListState.isEmpty ? <div className="text-xs text-gray-500">No notes yet.</div> : null}
                </>
              )}
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
            <DateTimePicker
              aria-label="Time of occurrence"
              value={toDatetimeLocalValue(draft.occurred_at)}
              onChange={(v) => setDraft((prev) => ({ ...prev, occurred_at: fromDatetimeLocalValue(v) }))}
              className="font-normal normal-case"
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
          <div className="text-xs text-slate-600">
            <label htmlFor="safety-event-kpi-bucket">KPI bucket</label>
            <Combobox
            id="safety-event-kpi-bucket"
            options={[
              { value: "incidents", label: "Incidents" },
              { value: "violations", label: "Violations" },
              { value: "claims", label: "Claims" },
              { value: "commendations", label: "Commendations" },
            ]}
            value={draft.kpi_bucket}
            onChange={(next) => next && setDraft((prev) => ({ ...prev, kpi_bucket: next as EventDraft["kpi_bucket"] }))}
            placeholder="Select KPI bucket"
            />
          </div>
          <div className="text-xs text-slate-600">
            <label htmlFor="safety-event-severity">Severity</label>
            <Combobox
            id="safety-event-severity"
            options={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
              { value: "critical", label: "Critical" },
            ]}
            value={draft.severity}
            onChange={(next) => next && setDraft((prev) => ({ ...prev, severity: next as EventDraft["severity"] }))}
            placeholder="Select severity"
            />
          </div>
          <div className="text-xs text-slate-600">
            <label htmlFor="safety-event-status">Status</label>
            <Combobox
            id="safety-event-status"
            options={[
              { value: "open", label: "Open" },
              { value: "acknowledged", label: "Acknowledged" },
              { value: "closed", label: "Closed" },
            ]}
            value={draft.status}
            onChange={(next) => next && setDraft((prev) => ({ ...prev, status: next as EventDraft["status"] }))}
            placeholder="Select status"
            />
          </div>
          <div className="text-xs text-slate-600">
            <label htmlFor="safety-event-subject-type">Subject type</label>
            <Combobox
            id="safety-event-subject-type"
            options={[
              { value: "company", label: "Company" },
              { value: "driver", label: "Driver" },
              { value: "unit", label: "Unit" },
            ]}
            value={draft.subject_type}
            onChange={(next) => next && setDraft((prev) => ({ ...prev, subject_type: next as EventDraft["subject_type"] }))}
            placeholder="Select subject type"
            />
          </div>
          {/* C1 PICKER LAW: both were raw-UUID boxes. A safety event whose subject FK is blank is a
              DOT-reportable record attached to no driver and no unit — the exact linkage failure the
              picker law exists to stop. */}
          <EntityPicker
            kind="driver"
            operatingCompanyId={operatingCompanyId}
            value={draft.subject_driver_id || null}
            onChange={(next) => setDraft((prev) => ({ ...prev, subject_driver_id: next ?? "" }))}
            placeholder="Subject driver (optional)"
          />
          <EntityPicker
            kind="unit"
            operatingCompanyId={operatingCompanyId}
            value={draft.subject_unit_id || null}
            onChange={(next) => setDraft((prev) => ({ ...prev, subject_unit_id: next ?? "" }))}
            placeholder="Subject unit (optional)"
          />
          {/* FAIL-S1: same picker the External-Fines create modal already ships (FineCreateModal
              "Related load"). Without it related_load_id is NULL at insert, and safety_events is
              append-only, so the link can never be repaired afterwards. */}
          <EntityPicker
            kind="load"
            operatingCompanyId={operatingCompanyId}
            value={draft.related_load_id || null}
            onChange={(next) => setDraft((prev) => ({ ...prev, related_load_id: next ?? "" }))}
            placeholder="Related load (optional)"
            dataTestId="safety-event-related-load-picker"
          />
          <div className="sm:col-span-2">
            <LoadSuggestionReadError query={suggestionQuery} />
          </div>
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

        <div className="mt-4 flex flex-col items-end gap-2">
          {createMutation.isError &&
          createMutation.variables?.generation === companyGenerationRef.current ? (
            <p className="w-full text-xs text-red-700" data-testid="safety-event-create-error">
              {userFacingApiError(createMutation.error, "Could not save the safety event.")}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() =>
              createMutation.mutate({
                companyId: operatingCompanyId,
                generation: companyGenerationRef.current,
                draft: { ...draft },
              })
            }
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
  value: number | string;
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
  if (row.subject_type === "driver") {
    const id = String(row.subject_driver_id ?? "").trim();
    const label = entityLabel(row.subject_driver_name, id, "Driver");
    if (!id) return label;
    return <EntityLink kind="driver" id={id} label={label} />;
  }
  if (row.subject_type === "unit") {
    const id = String(row.subject_unit_id ?? "").trim();
    const label = entityLabel(row.subject_unit_number, id, "Unit");
    if (!id) return label;
    return <EntityLink kind="unit" id={id} label={label} />;
  }
  return "Company";
}
