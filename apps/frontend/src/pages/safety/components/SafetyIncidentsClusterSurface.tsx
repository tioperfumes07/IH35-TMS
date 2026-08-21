import { useCallback, useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { formatDateUS } from "../../../lib/formatDate";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSafetyIncident,
  getSafetyIncident,
  listSafetyIncidents,
  setSafetyIncidentStatus,
  updateSafetyIncident,
  voidSafetyIncident,
  uploadSafetyIncidentPhoto,
  type SafetyIncidentType,
} from "../../../api/safety";
import { useAuth } from "../../../auth/useAuth";
import { Button } from "../../../components/Button";
import { DriverPickerWithCreate } from "../../../components/drivers/DriverPickerWithCreate";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { DatePicker } from "../../../components/forms/DatePicker";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { companyToday } from "../../../lib/businessDate";
import { useListState } from "../../../components/list-state";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { useStagedListFilters } from "../../../components/table";
import { formatUsdCents } from "../../../lib/money";
import { DamageReportDetail } from "../damage-reports/DamageReportDetail";
import { userFacingApiError } from "../../../lib/api-error-message";
import { suggestExpenseLoad } from "../../../api/maintenance";

// Declarative per-incident-type field keys. The COMMON set renders for every type;
// `typedFields` on each config adds the type-specific inputs (root-fix: one surface,
// two typed creators — DAMAGE + TRAILER-INTERCHANGE). Cargo claims have their own
// dedicated Carmack intake surface (SC4 CargoClaimIntakeSurface) and do NOT use this surface.
export type IncidentFieldKey =
  | "incident_date"
  | "driver_id"
  | "unit_id"
  | "trailer_id"
  | "load_id"
  | "location"
  | "description"
  | "damage_amount_cents"
  | "interchange_party";

// Fields shown for every incident type routed through this shared surface.
const COMMON_FIELDS: IncidentFieldKey[] = [
  "incident_date",
  "driver_id",
  "unit_id",
  "trailer_id",
  "load_id",
  "location",
  "description",
];

export type IncidentsClusterConfig = {
  incidentType: SafetyIncidentType;
  title: string;
  subtitle: string;
  pageTestId: string;
  createLabel: string;
  detailLabel: string;
  // Type-specific fields beyond COMMON_FIELDS (damage amount / interchange party).
  typedFields: IncidentFieldKey[];
  // Extra required fields beyond the always-required date + location + description.
  requiredExtraFields: IncidentFieldKey[];
  // Prompt to confirm saving with no condition photos (trailer interchange / TIR pattern).
  confirmWithoutPhotos?: boolean;
};

type Props = {
  operatingCompanyId: string;
  config: IncidentsClusterConfig;
};

type DraftState = Record<string, unknown>;

function createDraftIncident(config: IncidentsClusterConfig): DraftState {
  return {
    id: "__create__",
    incident_type: config.incidentType,
    status: "open",
    incident_date: companyToday(),
    location: "",
    description: "",
    driver_id: "",
    unit_id: "",
    trailer_id: "",
    load_id: "",
    damage_amount_cents: null,
    interchange_party: "",
  };
}

function toIsoAtNoon(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  const d = new Date(`${dateStr}T12:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function str(value: unknown): string {
  return value == null ? "" : String(value);
}

function isoToDateInput(iso: unknown): string {
  const s = str(iso);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function incidentRowToDraft(row: Record<string, unknown>): DraftState {
  return {
    ...row,
    incident_date: isoToDateInput(row.incident_at ?? row.incident_date),
  } as DraftState;
}

export function SafetyIncidentsClusterSurface({ operatingCompanyId, config }: Props) {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<DraftState | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedHint, setSavedHint] = useState(false);
  // S-08 + s-04 + LV-SAFETY-INCIDENTS-CLUSTER-FILTER-SILENT-APPLY — stage until Apply;
  // date range is sent as date_from/date_to query params (backend list route).
  const [searchParams, setSearchParams] = useSearchParams();
  const loadIdFromUrl = searchParams.get("load_id")?.trim() ?? "";
  const trailerIdFromUrl = searchParams.get("trailer_id")?.trim() ?? "";
  const driverIdFromUrl = searchParams.get("driver_id")?.trim() ?? "";
  const unitIdFromUrl = searchParams.get("unit_id")?.trim() ?? "";

  const EMPTY_FILTERS = {
    driverId: "",
    unitId: "",
    loadId: "",
    trailerId: "",
    from: "",
    to: "",
  };

  // LST-F5194 — list filters write driver_id/unit_id/load_id/trailer_id to URL on Apply (not silent draft).
  function patchListSearchParam(
    next: { driverId: string; unitId: string; loadId: string; trailerId: string },
  ) {
    const p = new URLSearchParams(searchParams);
    const pairs: Array<["driver_id" | "unit_id" | "load_id" | "trailer_id", string]> = [
      ["driver_id", next.driverId],
      ["unit_id", next.unitId],
      ["load_id", next.loadId],
      ["trailer_id", next.trailerId],
    ];
    for (const [key, value] of pairs) {
      if (value) p.set(key, value);
      else p.delete(key);
    }
    setSearchParams(p, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    driverId: driverIdFromUrl,
    unitId: unitIdFromUrl,
    loadId: loadIdFromUrl,
    trailerId: trailerIdFromUrl,
  }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      setApplied(next);
      patchListSearchParam(next);
    },
  });
  const draft = staged.draft;

  useEffect(() => {
    setApplied((prev) => ({
      ...prev,
      driverId: driverIdFromUrl,
      unitId: unitIdFromUrl,
      loadId: loadIdFromUrl,
      trailerId: trailerIdFromUrl,
    }));
  }, [driverIdFromUrl, unitIdFromUrl, loadIdFromUrl, trailerIdFromUrl]);

  const typedFields = config.typedFields;
  const has = (key: IncidentFieldKey) => COMMON_FIELDS.includes(key) || typedFields.includes(key);

  const listFilters = useMemo(
    () => ({
      driver_id: applied.driverId.trim() || undefined,
      unit_id: applied.unitId.trim() || undefined,
      load_id: applied.loadId.trim() || undefined,
      trailer_id: applied.trailerId.trim() || undefined,
      date_from: applied.from || undefined,
      date_to: applied.to || undefined,
    }),
    [applied]
  );

  const listQuery = useQuery({
    queryKey: ["safety", "incidents", config.incidentType, operatingCompanyId, listFilters],
    queryFn: () => listSafetyIncidents(operatingCompanyId, config.incidentType, listFilters),
    enabled: Boolean(operatingCompanyId),
  });

  const detailQuery = useQuery({
    queryKey: ["safety", "incident-detail", selected?.id, operatingCompanyId],
    queryFn: () => getSafetyIncident(String(selected?.id), operatingCompanyId),
    enabled:
      drawerOpen && Boolean(selected?.id) && String(selected?.id) !== "__create__" && Boolean(operatingCompanyId),
  });

  const createMode = String(selected?.id ?? "") === "__create__";
  const [suggestionPinned, setSuggestionPinned] = useState(false);
  const suggestionQuery = useQuery({
    queryKey: [
      "safety",
      "incidents-cluster-create",
      "suggest-load",
      operatingCompanyId,
      selected?.driver_id,
      selected?.unit_id,
      selected?.trailer_id,
      selected?.incident_date,
    ],
    queryFn: () =>
      suggestExpenseLoad({
        operating_company_id: operatingCompanyId,
        driver_id: str(selected?.driver_id) || undefined,
        unit_id: str(selected?.unit_id) || undefined,
        trailer_id: str(selected?.trailer_id) || undefined,
        transaction_date: str(selected?.incident_date),
      }),
    enabled: Boolean(
      createMode &&
        operatingCompanyId &&
        str(selected?.incident_date) &&
        (str(selected?.driver_id) || str(selected?.unit_id) || str(selected?.trailer_id))
    ),
  });

  useEffect(() => {
    setSuggestionPinned(false);
  }, [selected?.driver_id, selected?.unit_id, selected?.trailer_id, selected?.incident_date]);

  useEffect(() => {
    if (str(selected?.load_id) || suggestionPinned) return;
    const suggested = suggestionQuery.data?.data;
    if (!suggested?.load_id) return;
    setSelected((previous) => ({ ...(previous ?? {}), load_id: suggested.load_id }));
    setSuggestionPinned(true);
  }, [selected?.load_id, suggestionPinned, suggestionQuery.data]);
  // SAF-F20: these three surfaces were CREATE-ONLY — every field was disabled once the record
  // existed, so an incident filed with the wrong amount, unit or description could never be
  // corrected, and one filed in error stayed "open" forever. `formEditable` is what the FIELDS gate
  // on; `createMode` still gates create-only affordances (the Save-then-add-photos hint, the create
  // button) so nothing about the create flow changes.
  const [editMode, setEditMode] = useState(false);
  const formEditable = createMode || editMode;
  const [statusReason, setStatusReason] = useState("");
  const [statusTarget, setStatusTarget] = useState<"open" | "investigating" | "closed" | null>(null);
  // SAF-B19: void is a RETRACTION, not a lifecycle outcome — kept in its own state so it can never be
  // reached by the close/reopen buttons. Gate mirrors the server exactly (Owner/Administrator).
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState<string | null>(null);
  const { user } = useAuth();
  const canVoid = user?.role === "Owner" || user?.role === "Administrator";

  // SAF-B29: pickers are EntityPicker / DriverPickerWithCreate (server search). Do NOT bulk
  // listUnits/listDrivers roster fetches for labels — list/detail APIs already JOIN unit_number /
  // trailer_number / driver_name. Silent fleet maps fail verify-safety-b29-typeahead-inventory.

  // Server already applies date_from/date_to (+ driver/unit) — no second client filter.
  const rows = listQuery.data?.incidents ?? [];

  // SAF-B30: EntityLink kind "incident" routes here with ?incident_id=<id>. Nothing read it before,
  // so damage reports, trailer interchanges and cargo claims were undrillable — the link navigated to
  // the right list and then stopped. Same shape AccidentsPage uses for ?accident_id=: open the record
  // once the list has loaded, then strip the param so a refresh does not re-open it.
  const incidentIdParam = searchParams.get("incident_id");
  useEffect(() => {
    if (!incidentIdParam || rows.length === 0) return;
    const match = (rows as Array<Record<string, unknown>>).find((r) => String(r.id) === incidentIdParam);
    if (match) {
      setSelected(match as DraftState);
      setDrawerOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("incident_id");
      setSearchParams(next, { replace: true });
    }
  }, [incidentIdParam, rows, searchParams, setSearchParams]);
  // LIST-EMPTY: the empty message renders only after the incidents query settles.
  const listState = useListState(listQuery, rows.length === 0);
  const detail = createMode ? selected : detailQuery.data?.incident ?? selected;

  const openRow = useCallback((row: DraftState) => {
    setEditMode(false);
    setStatusTarget(null);
    setStatusReason("");
    setVoidOpen(false);
    setVoidReason("");
    setVoidError(null);
    setSelected(row);
    setDrawerOpen(true);
    setSavedHint(false);
  }, []);

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelected(null);
    setEditMode(false);
    setStatusTarget(null);
    setStatusReason("");
    setVoidOpen(false);
    setVoidReason("");
    setVoidError(null);
    setSavedHint(false);
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["safety", "incidents"] });
  };

  const setField = (key: string, value: unknown) =>
    setSelected((prev) => ({ ...(prev ?? {}), [key]: value }));

  // Required-field computation — disabled Save must always tell the user what is missing.
  const missingFields = useMemo(() => {
    if (!createMode || !selected) return [] as string[];
    const missing: string[] = [];
    if (!str(selected.incident_date)) missing.push("Incident date");
    if (!str(selected.location).trim()) missing.push("Location");
    if (!str(selected.description).trim()) missing.push("Description");
    if (config.requiredExtraFields.includes("trailer_id") && !str(selected.trailer_id)) missing.push("Trailer");
    return missing;
  }, [createMode, selected, config.requiredExtraFields]);

  const saveCreate = async () => {
    if (!createMode || !selected || missingFields.length > 0 || saving) return;

    // Trailer interchange (TIR): condition photos protect the company on damage disputes.
    // Photos attach post-save, so at create there are never photos yet — confirm intent.
    if (config.confirmWithoutPhotos) {
      const ok = window.confirm(
        "Interchange condition photos protect the company on damage disputes — continue without?"
      );
      if (!ok) return;
    }

    const payload: Parameters<typeof createSafetyIncident>[0] = {
      operating_company_id: operatingCompanyId,
      incident_type: config.incidentType,
      incident_at: toIsoAtNoon(str(selected.incident_date)),
      location: str(selected.location),
      description: str(selected.description),
      driver_id: str(selected.driver_id) || null,
      unit_id: str(selected.unit_id) || null,
      trailer_id: str(selected.trailer_id) || null,
      load_id: str(selected.load_id) || null,
    };
    if (has("interchange_party")) payload.interchange_party = str(selected.interchange_party).slice(0, 200) || null;
    if (has("damage_amount_cents")) {
      const cents = selected.damage_amount_cents;
      payload.damage_amount_cents = typeof cents === "number" && Number.isFinite(cents) && cents > 0 ? cents : 0;
    }

    setSaving(true);
    try {
      const res = await createSafetyIncident(payload);
      const created = res.incident;
      refresh();
      if (created?.id) {
        // Post-save photo step: keep the drawer open on the new record in detail mode so the
        // user can add condition/damage photos immediately (the surface supports detail-mode upload).
        setSelected(created as DraftState);
        setSavedHint(true);
      } else {
        closeDrawer();
      }
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = () => {
    const src = (detailQuery.data?.incident ?? selected) as Record<string, unknown> | null;
    if (!src?.id || src.voided_at) return;
    setSelected(incidentRowToDraft(src));
    setEditMode(true);
  };

  const saveEdit = async () => {
    if (!editMode || !selected?.id || saving) return;
    const payload: Record<string, unknown> = {
      location: str(selected.location).trim(),
      description: str(selected.description).trim(),
      driver_id: str(selected.driver_id) || null,
      unit_id: str(selected.unit_id) || null,
      trailer_id: str(selected.trailer_id) || null,
      load_id: str(selected.load_id) || null,
    };
    const incidentAt = toIsoAtNoon(str(selected.incident_date));
    if (incidentAt) payload.incident_at = incidentAt;
    if (has("interchange_party")) {
      payload.interchange_party = str(selected.interchange_party).slice(0, 200) || null;
    }
    if (has("damage_amount_cents")) {
      const cents = selected.damage_amount_cents;
      payload.damage_amount_cents =
        typeof cents === "number" && Number.isFinite(cents) && cents > 0 ? cents : 0;
    }

    setSaving(true);
    try {
      await updateSafetyIncident(String(selected.id), operatingCompanyId, payload);
      setEditMode(false);
      refresh();
      await detailQuery.refetch();
    } finally {
      setSaving(false);
    }
  };

  const onPhotoSelected = async (file: File | null) => {
    if (!file || createMode || !selected?.id) return;
    setUploading(true);
    try {
      await uploadSafetyIncidentPhoto(String(selected.id), operatingCompanyId, file);
      refresh();
      void detailQuery.refetch();
    } finally {
      setUploading(false);
    }
  };

  const photoCount = useMemo(() => {
    const keys = detail?.photo_keys;
    return Array.isArray(keys) ? keys.length : 0;
  }, [detail]);

  // Migrated to shared QBO-parity grid — columns, order, and per-row detail action preserved (§7 additive-only).
  const incidentColumns = useMemo<Array<ParityColumn<DraftState>>>(
    () => [
      {
        key: "incident_at",
        label: "Date",
        sortable: true,
        render: (row) => formatDateUS(row.incident_at as string | undefined),
      },
      {
        key: "driver_id",
        label: "Driver",
        sortable: true,
                render: (row) =>
          row.driver_id ? (
            <EntityLink
              kind="driver"
              id={String(row.driver_id)}
              label={entityLabel(row.driver_name, row.driver_id, "Driver")}
            />
          ) : (
            "—"
          ),
      },
      {
        key: "unit_id",
        label: "Unit",
        sortable: true,
                render: (row) =>
          row.unit_id ? (
            <EntityLink
              kind="unit"
              id={String(row.unit_id)}
              label={entityLabel(str(row.unit_number) || null, row.unit_id, "Unit")}
            />
          ) : (
            "—"
          ),
      },
      {
        // SAF-C06 fixed the list API to JOIN trailer_number/trailer_id server-side (comment above the
        // list query: "operators could read a name but could not drill through to ... trailer"), but
        // this table never rendered the column — trailer_interchange rows (the entire subject of a
        // trailer interchange is a trailer) and damage_report rows had no visible trailer link at all.
        key: "trailer_id",
        label: "Trailer",
        sortable: true,
        render: (row) =>
          row.trailer_id ? (
            <EntityLink
              kind="trailer"
              id={String(row.trailer_id)}
              label={entityLabel(str(row.trailer_number) || null, row.trailer_id, "Trailer")}
            />
          ) : (
            "—"
          ),
      },
      {
        key: "location",
        label: "Location",
        sortable: true,
        render: (row) => str(row.location) || "—",
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (row) => str(row.status) || "open",
      },
      {
        key: "action",
        label: "Action",
        render: (row) => (
          <button type="button" className="text-slate-700 underline" onClick={() => openRow(row)}>
            {config.detailLabel}
          </button>
        ),
      },
    ],
    [config.detailLabel, openRow]
  );

  const inputCls = "mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-xs";

  return (
    <div className="space-y-3" data-testid={config.pageTestId}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 bg-white px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">{config.title}</div>
          <div className="text-[11px] text-slate-500">{config.subtitle}</div>
        </div>
        <Button
          size="sm"
          data-testid={`${config.pageTestId}-create-btn`}
          onClick={() => {
            setSelected(createDraftIncident(config));
            setDrawerOpen(true);
            setSavedHint(false);
          }}
        >
          {config.createLabel}
        </Button>
      </div>

      <div
        className="flex flex-wrap items-end gap-3 rounded-sm border border-gray-200 bg-white px-3 py-2"
        data-testid={`${config.pageTestId}-filters`}
      >
        <label className="text-[11px] text-slate-600">
          Driver
          <EntityPicker
            kind="driver"
            operatingCompanyId={operatingCompanyId}
            value={draft.driverId || null}
            onChange={(next) => staged.setDraft((d) => ({ ...d, driverId: next ?? "" }))}
            allowCreate={false}
            placeholder="All drivers"
            className="mt-1 block min-w-[10rem]"
            dataTestId={`${config.pageTestId}-filter-driver`}
          />
        </label>
        <label className="text-[11px] text-slate-600">
          Unit
          <EntityPicker
            kind="unit"
            operatingCompanyId={operatingCompanyId}
            value={draft.unitId || null}
            onChange={(next) => staged.setDraft((d) => ({ ...d, unitId: next ?? "" }))}
            allowCreate={false}
            placeholder="All units"
            className="mt-1 block min-w-[8rem]"
            dataTestId={`${config.pageTestId}-filter-unit`}
          />
        </label>
        <label className="text-[11px] text-slate-600">
          Load
          <EntityPicker
            kind="load"
            operatingCompanyId={operatingCompanyId}
            value={draft.loadId || null}
            onChange={(next) => staged.setDraft((d) => ({ ...d, loadId: next ?? "" }))}
            allowCreate={false}
            placeholder="All loads"
            className="mt-1 block min-w-[8rem]"
            dataTestId={`${config.pageTestId}-filter-load`}
          />
        </label>
        <label className="text-[11px] text-slate-600">
          Trailer
          <EntityPicker
            kind="trailer"
            operatingCompanyId={operatingCompanyId}
            value={draft.trailerId || null}
            onChange={(next) => staged.setDraft((d) => ({ ...d, trailerId: next ?? "" }))}
            allowCreate={false}
            placeholder="All trailers"
            className="mt-1 block min-w-[8rem]"
            dataTestId={`${config.pageTestId}-filter-trailer`}
          />
        </label>
        <label className="text-[11px] text-slate-600">
          From
          <DatePicker
            value={draft.from}
            onChange={(next) => staged.setDraft((d) => ({ ...d, from: next }))}
            className="mt-1 block min-h-12 w-full"
            max={draft.to || undefined}
            data-testid="safety-incidents-from-date"
          />
        </label>
        <label className="text-[11px] text-slate-600">
          To
          <DatePicker
            value={draft.to}
            onChange={(next) => staged.setDraft((d) => ({ ...d, to: next }))}
            className="mt-1 block min-h-12 w-full"
            min={draft.from || undefined}
            data-testid="safety-incidents-to-date"
          />
        </label>
        <Button type="button" size="sm" data-testid={`${config.pageTestId}-filter-apply`} onClick={staged.apply} disabled={!staged.dirty}>
          Apply
        </Button>
        <Button type="button" size="sm" variant="secondary" data-testid={`${config.pageTestId}-filter-cancel`} onClick={staged.cancel} disabled={!staged.dirty}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid={`${config.pageTestId}-filter-reset`}
          onClick={() => {
            staged.cancel();
            setApplied(EMPTY_FILTERS);
            patchListSearchParam(EMPTY_FILTERS);
          }}
        >
          Reset
        </Button>
      </div>

      {listQuery.isError ? (
        <ListErrorState
          title="Couldn't load incidents"
          status={0}
          message={(listQuery.error as Error)?.message}
          onRetry={() => void listQuery.refetch()}
        />
      ) : (
        <ParityTable<DraftState>
          columns={incidentColumns}
          rows={rows}
          rowKey={(row) => String(row.id)}
          loading={listState.isLoading}
          emptyText="No records found."
          storageKey={`safety-incidents-cluster-${config.incidentType}`}
          exportFilename={`safety-incidents-${config.incidentType}`}
          tableTestId={`${config.pageTestId}-table`}
          rowTestId={(row) => `${config.pageTestId}-row-${String(row.id)}`}
        />
      )}

      {drawerOpen ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid={`${config.pageTestId}-drawer`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-800">
              {createMode ? config.createLabel : editMode ? `Edit ${config.detailLabel}` : config.detailLabel}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!createMode && !editMode && detail?.id && !detail?.voided_at ? (
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid={`${config.pageTestId}-edit-btn`}
                  onClick={beginEdit}
                >
                  Edit
                </Button>
              ) : null}
              {editMode ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    data-testid={`${config.pageTestId}-cancel-edit-btn`}
                    disabled={saving}
                    onClick={() => {
                      const src = (detailQuery.data?.incident ?? selected) as Record<string, unknown> | null;
                      if (src) setSelected(incidentRowToDraft(src));
                      setEditMode(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={saving || !str(selected?.location).trim() || !str(selected?.description).trim()}
                    data-testid={`${config.pageTestId}-save-edit-btn`}
                    onClick={() => void saveEdit()}
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                </>
              ) : null}
              <button type="button" className="text-xs text-slate-500 underline" onClick={closeDrawer}>
                Close
              </button>
            </div>
          </div>

          {savedHint ? (
            <div
              className="mb-2 text-[11px] font-medium text-slate-700"
              data-testid={`${config.pageTestId}-saved-hint`}
            >
              Report saved — add photos now.
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            {has("incident_date") ? (
              <label className="block">
                <span className="text-slate-600">Incident date</span>
                {formEditable ? (
                  <DatePicker
                    value={str(selected?.incident_date)}
                    onChange={(v) => setField("incident_date", v)}
                    data-testid={`${config.pageTestId}-field-incident_date`}
                    max={companyToday()}
                  />
                ) : (
                  <div className="mt-1 text-slate-800">{formatDateUS(detail?.incident_at)}</div>
                )}
              </label>
            ) : null}

            {has("driver_id") ? (
              <label className="block">
                <span className="text-slate-600">Driver</span>
                {formEditable ? (
                  <div className="mt-1" data-testid={`${config.pageTestId}-field-driver_id`}>
                    <DriverPickerWithCreate
                      operatingCompanyId={operatingCompanyId}
                      value={str(selected?.driver_id) || null}
                      onChange={(next) => setField("driver_id", next ?? "")}
                      placeholder="Select driver"
                    />
                  </div>
                ) : detail?.driver_id ? (
                  <div className="mt-1">
                    <EntityLink
                      kind="driver"
                      id={String(detail.driver_id)}
                      label={entityLabel(detail.driver_name, detail.driver_id, "Driver")}
                    />
                  </div>
                ) : (
                  <div className="mt-1 text-slate-800">—</div>
                )}
              </label>
            ) : null}

            {has("unit_id") ? (
              <label className="block">
                <span className="text-slate-600">Unit</span>
                {formEditable ? (
                  <div className="mt-1" data-testid={`${config.pageTestId}-field-unit_id`}>
                    <EntityPicker
                      kind="unit"
                      operatingCompanyId={operatingCompanyId}
                      value={str(selected?.unit_id) || null}
                      onChange={(next) => setField("unit_id", next ?? "")}
                      allowCreate
                      nestedInDrawer
                      enabled={drawerOpen && formEditable}
                      placeholder="Select unit"
                      className="w-full"
                      dataField={`${config.pageTestId}-unit`}
                      dataTestId={`${config.pageTestId}-unit`}
                      allowClear
                    />
                  </div>
                ) : (
                  <div className="mt-1 text-slate-800">
                    {str(detail?.unit_number) || "—"}
                  </div>
                )}
              </label>
            ) : null}

            {has("trailer_id") ? (
              <label className="block">
                <span className="text-slate-600">
                  Trailer{config.requiredExtraFields.includes("trailer_id") ? " *" : ""}
                </span>
                {formEditable ? (
                  <div className="mt-1" data-testid={`${config.pageTestId}-field-trailer_id`}>
                    <EntityPicker
                      kind="trailer"
                      operatingCompanyId={operatingCompanyId}
                      value={str(selected?.trailer_id) || null}
                      onChange={(next) => setField("trailer_id", next ?? "")}
                      allowCreate
                      nestedInDrawer
                      enabled={drawerOpen && formEditable}
                      placeholder="Select trailer"
                      className="w-full"
                      dataField={`${config.pageTestId}-trailer`}
                      dataTestId={`${config.pageTestId}-trailer`}
                      allowClear
                    />
                  </div>
                ) : detail?.trailer_id ? (
                  <div className="mt-1">
                    <EntityLink
                      kind="trailer"
                      id={String(detail.trailer_id)}
                      label={entityLabel(detail.trailer_number, detail.trailer_id, "Trailer")}
                      data-testid={`${config.pageTestId}-detail-trailer-link`}
                    />
                  </div>
                ) : (
                  <div className="mt-1 text-slate-800">—</div>
                )}
              </label>
            ) : null}

            {has("load_id") ? (
              <label className="block">
                <span className="text-slate-600">Load</span>
                {formEditable ? (
                  <div className="mt-1" data-testid={`${config.pageTestId}-field-load_id`}>
                    <EntityPicker
                      kind="load"
                      operatingCompanyId={operatingCompanyId}
                      value={str(selected?.load_id) || null}
                      onChange={(next) => setField("load_id", next ?? "")}
                      allowCreate
                      nestedInDrawer
                      enabled={drawerOpen && formEditable}
                      placeholder="Select load"
                      className="w-full"
                      dataField={`${config.pageTestId}-load`}
                      dataTestId={`${config.pageTestId}-load`}
                      allowClear
                    />
                  </div>
                ) : detail?.load_id ? (
                  <div className="mt-1">
                    <EntityLink
                      kind="load"
                      id={String(detail.load_id)}
                      label={entityLabel(detail.load_number, detail.load_id, "Load")}
                      data-testid={`${config.pageTestId}-detail-load-link`}
                    />
                  </div>
                ) : (
                  <div className="mt-1 text-slate-800">—</div>
                )}
              </label>
            ) : null}

            {has("interchange_party") ? (
              <label className="block">
                <span className="text-slate-600">Interchange party</span>
                {formEditable ? (
                  <input
                    className={inputCls}
                    maxLength={200}
                    value={str(selected?.interchange_party)}
                    data-testid={`${config.pageTestId}-field-interchange_party`}
                    onChange={(e) => setField("interchange_party", e.target.value)}
                  />
                ) : (
                  <div className="mt-1 text-slate-800">{str(detail?.interchange_party) || "—"}</div>
                )}
              </label>
            ) : null}

            {has("damage_amount_cents") ? (
              <label className="block">
                <span className="text-slate-600">Estimated damage amount</span>
                {formEditable ? (
                  <div className="mt-1" data-testid={`${config.pageTestId}-field-damage_amount_cents`}>
                    <MoneyInput
                      ariaLabel="Estimated damage amount"
                      valueCents={(selected?.damage_amount_cents as number | null | undefined) ?? null}
                      onChangeCents={(c) => setField("damage_amount_cents", c)}
                    />
                  </div>
                ) : (
                  <div className="mt-1 text-slate-800">
                    {formatUsdCents(Number(detail?.damage_amount_cents ?? 0))}
                  </div>
                )}
              </label>
            ) : null}
          </div>

          <div className="mt-2 space-y-2 text-xs">
            {has("location") ? (
              <label className="block">
                <span className="text-slate-600">Location *</span>
                <input
                  className={inputCls}
                  value={str(formEditable ? selected?.location : detail?.location)}
                  disabled={!formEditable}
                  data-testid={`${config.pageTestId}-field-location`}
                  onChange={(e) => setField("location", e.target.value)}
                />
              </label>
            ) : null}
            {has("description") ? (
              <label className="block">
                <span className="text-slate-600">Description *</span>
                <textarea
                  className={inputCls}
                  rows={3}
                  value={str(formEditable ? selected?.description : detail?.description)}
                  disabled={!formEditable}
                  data-testid={`${config.pageTestId}-field-description`}
                  onChange={(e) => setField("description", e.target.value)}
                />
              </label>
            ) : null}

            {!createMode ? (
              <div className="space-y-1">
                <div className="text-slate-600">Photos ({photoCount})</div>
                <input
                  type="file"
                  accept="image/*"
                  data-testid={`${config.pageTestId}-photo-input`}
                  disabled={uploading}
                  onChange={(e) => void onPhotoSelected(e.target.files?.[0] ?? null)}
                />
              </div>
            ) : null}

            {!createMode && config.incidentType === "damage_report" && detail?.id ? (
              <div className="mt-3">
                <DamageReportDetail damageUuid={String(detail.id)} operatingCompanyId={operatingCompanyId} />
              </div>
            ) : null}

            {!createMode && detail?.id ? (
              <div className="space-y-2 rounded-sm border border-gray-200 p-2" data-testid={`${config.pageTestId}-lifecycle`}>
                <div className="text-slate-600">
                  Status: <span className="font-semibold text-slate-800">{str(detail?.status) || "open"}</span>
                </div>
                {/* SAF-F20: a status change is an accountable decision, not a field edit — the reason
                    is required before the transition can be sent, matching every other close/void
                    contract in the app. */}
                <div className="flex flex-wrap items-center gap-2">
                  {(["open", "investigating", "closed"] as const)
                    .filter((next) => next !== (str(detail?.status) || "open"))
                    .map((next) => (
                      <button
                        key={next}
                        type="button"
                        className={
                          statusTarget === next
                            ? "rounded-sm border border-[#1f2a44] px-2 py-1 font-semibold text-[#1f2a44]"
                            : "rounded-sm border border-gray-300 px-2 py-1 text-slate-600"
                        }
                        data-testid={`${config.pageTestId}-status-${next}`}
                        onClick={() => setStatusTarget((cur) => (cur === next ? null : next))}
                      >
                        {next === "open" ? "Reopen" : next === "closed" ? "Close" : "Investigate"}
                      </button>
                    ))}
                </div>
                {statusTarget ? (
                  <div className="space-y-1">
                    <input
                      className={inputCls}
                      placeholder="Reason (required)"
                      value={statusReason}
                      data-testid={`${config.pageTestId}-status-reason`}
                      onChange={(e) => setStatusReason(e.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={statusReason.trim().length < 3}
                      data-testid={`${config.pageTestId}-status-apply`}
                      onClick={() => {
                        if (!detail?.id || !statusTarget) return;
                        void setSafetyIncidentStatus(
                          String(detail.id),
                          operatingCompanyId,
                          statusTarget,
                          statusReason.trim()
                        ).then(async () => {
                          setStatusTarget(null);
                          setStatusReason("");
                          await queryClient.invalidateQueries({ queryKey: ["safety", "incidents"] });
                          await detailQuery.refetch();
                        });
                      }}
                    >
                      Apply status
                    </Button>
                  </div>
                ) : null}
                {/* SAF-B19: the void route (incidents.routes.ts:576) has been registered and callable
                    since SAF-F20 with no client and no control anywhere in the app — an incident filed
                    in error could be closed, but never retracted, by anyone without direct API access.
                    Deliberately separated from the status buttons above: closing records an outcome,
                    voiding says the record should not have existed. */}
                {!createMode && detail?.id && !detail?.voided_at && canVoid ? (
                  <div className="space-y-1 border-t border-gray-200 pt-2">
                    <button
                      type="button"
                      className="rounded-sm border border-gray-300 px-2 py-1 text-[#dc2626]"
                      data-testid={`${config.pageTestId}-void-btn`}
                      onClick={() => {
                        setVoidOpen((cur) => !cur);
                        setVoidError(null);
                      }}
                    >
                      Void incident
                    </button>
                    {voidOpen ? (
                      <div className="space-y-1">
                        <input
                          className={inputCls}
                          placeholder="Void reason (required)"
                          value={voidReason}
                          data-testid={`${config.pageTestId}-void-reason`}
                          onChange={(e) => setVoidReason(e.target.value)}
                        />
                        {voidError ? (
                          <div className="text-[11px] text-[#dc2626]" data-testid={`${config.pageTestId}-void-error`}>
                            {voidError}
                          </div>
                        ) : null}
                        <Button
                          size="sm"
                          disabled={voidReason.trim().length < 3}
                          data-testid={`${config.pageTestId}-void-apply`}
                          onClick={() => {
                            if (!detail?.id) return;
                            setVoidError(null);
                            void voidSafetyIncident(String(detail.id), operatingCompanyId, voidReason.trim())
                              .then(async () => {
                                setVoidOpen(false);
                                setVoidReason("");
                                setDrawerOpen(false);
                                await queryClient.invalidateQueries({ queryKey: ["safety", "incidents"] });
                              })
                              .catch((err: unknown) => {
                                // No silent failure: a void that did not happen must never look like one
                                // that did.
                                setVoidError(userFacingApiError(err, "Could not void the safety incident."));
                              });
                          }}
                        >
                          Confirm void
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {!createMode && detail?.voided_at ? (
                  <div className="text-[11px] text-slate-500" data-testid={`${config.pageTestId}-voided-note`}>
                    Voided {formatDateUS(str(detail.voided_at))}
                    {str(detail.voided_reason) ? ` · ${str(detail.voided_reason)}` : ""}
                  </div>
                ) : null}
              </div>
            ) : null}

            {createMode ? (
              <div className="space-y-1">
                {missingFields.length > 0 ? (
                  <div className="text-[11px] text-slate-500" data-testid={`${config.pageTestId}-missing-fields`}>
                    Missing required: {missingFields.join(", ")}
                  </div>
                ) : null}
                <Button
                  size="sm"
                  disabled={missingFields.length > 0 || saving}
                  data-testid={`${config.pageTestId}-save-btn`}
                  onClick={() => void saveCreate()}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
