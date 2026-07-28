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
import { listDrivers, listUnits } from "../../../api/mdata";
import { listLoads } from "../../../api/loads";
import { useAuth } from "../../../auth/useAuth";
import { Button } from "../../../components/Button";
import { DriverPickerWithCreate } from "../../../components/drivers/DriverPickerWithCreate";
import { DatePicker } from "../../../components/forms/DatePicker";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { companyToday } from "../../../lib/businessDate";
import { useListState } from "../../../components/list-state";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { formatUsdCents } from "../../../lib/money";
import { DamageReportDetail } from "../damage-reports/DamageReportDetail";

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

export function SafetyIncidentsClusterSurface({ operatingCompanyId, config }: Props) {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<DraftState | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedHint, setSavedHint] = useState(false);
  // S-08 + s-04: list filters (driver/unit/from–to) — AccidentsPage-parity local state;
  // date range is sent as date_from/date_to query params (backend list route).
  const [driverFilter, setDriverFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const typedFields = config.typedFields;
  const has = (key: IncidentFieldKey) => COMMON_FIELDS.includes(key) || typedFields.includes(key);

  const listFilters = useMemo(
    () => ({
      driver_id: driverFilter.trim() || undefined,
      unit_id: unitFilter.trim() || undefined,
      date_from: fromDate || undefined,
      date_to: toDate || undefined,
    }),
    [driverFilter, unitFilter, fromDate, toDate]
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

  // Drivers + fleet feed BOTH the create pickers AND the list Driver/Unit columns, so they
  // load whenever a company is selected. limit:200 avoids the 50-cap picker landmine.
  const driversQuery = useQuery({
    queryKey: ["safety", "incidents-drivers", operatingCompanyId],
    queryFn: () => listDrivers({ operating_company_id: operatingCompanyId, limit: 200 }),
    enabled: Boolean(operatingCompanyId),
  });
  const fleetQuery = useQuery({
    queryKey: ["safety", "incidents-fleet", operatingCompanyId],
    queryFn: () => listUnits({ operating_company_id: operatingCompanyId, limit: 200, include: "trailers" }),
    enabled: Boolean(operatingCompanyId),
  });
  const loadsQuery = useQuery({
    queryKey: ["safety", "incidents-loads", operatingCompanyId],
    queryFn: () => listLoads({ operating_company_id: [operatingCompanyId], limit: 200 }),
    enabled: createMode && Boolean(operatingCompanyId),
  });

  const drivers = driversQuery.data?.drivers ?? [];
  const fleetRows = (fleetQuery.data?.units ?? []) as Array<Record<string, unknown>>;
  const unitOptions = fleetRows.filter((r) => str(r.kind) !== "trailer");
  const trailerOptions = fleetRows.filter((r) => str(r.kind) === "trailer");
  const loadOptions = loadsQuery.data?.loads ?? [];

  const driverNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of drivers) map.set(String(d.id), `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim());
    return map;
  }, [drivers]);
  const unitNumberById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of fleetRows) map.set(String(r.id), str(r.unit_number));
    return map;
  }, [fleetRows]);

  // Server already applies date_from/date_to (+ driver/unit) — no second client filter.
  const rows = listQuery.data?.incidents ?? [];

  // SAF-B30: EntityLink kind "incident" routes here with ?incident_id=<id>. Nothing read it before,
  // so damage reports, trailer interchanges and cargo claims were undrillable — the link navigated to
  // the right list and then stopped. Same shape AccidentsPage uses for ?accident_id=: open the record
  // once the list has loaded, then strip the param so a refresh does not re-open it.
  const [searchParams, setSearchParams] = useSearchParams();
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
    setSelected(row);
    setDrawerOpen(true);
    setSavedHint(false);
  }, []);

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelected(null);
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
          row.driver_id ? driverNameById.get(String(row.driver_id)) || "—" : "—",
      },
      {
        key: "unit_id",
        label: "Unit",
        sortable: true,
        render: (row) =>
          str(row.unit_number) || (row.unit_id ? unitNumberById.get(String(row.unit_id)) : "") || "—",
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
    [config.detailLabel, driverNameById, openRow, unitNumberById]
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
          <select
            className="mt-1 block min-h-12 min-w-[10rem] rounded-sm border border-gray-200 px-2 text-xs"
            value={driverFilter}
            onChange={(event) => setDriverFilter(event.target.value)}
            data-testid={`${config.pageTestId}-filter-driver`}
            aria-label="Filter by driver"
          >
            <option value="">All drivers</option>
            {drivers.map((d) => (
              <option key={String(d.id)} value={String(d.id)}>
                {`${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() || "Driver"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-slate-600">
          Unit
          <select
            className="mt-1 block min-h-12 min-w-[8rem] rounded-sm border border-gray-200 px-2 text-xs"
            value={unitFilter}
            onChange={(event) => setUnitFilter(event.target.value)}
            data-testid={`${config.pageTestId}-filter-unit`}
            aria-label="Filter by unit"
          >
            <option value="">All units</option>
            {unitOptions.map((u) => (
              <option key={str(u.id)} value={str(u.id)}>
                {str(u.unit_number) || "Unit"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-slate-600">
          From
          <DatePicker
            value={fromDate}
            onChange={setFromDate}
            className="mt-1 block min-h-12 w-full rounded-sm border border-gray-200 px-2 text-xs"
            max={toDate || undefined}
            data-testid="safety-incidents-from-date"
          />
        </label>
        <label className="text-[11px] text-slate-600">
          To
          <DatePicker
            value={toDate}
            onChange={setToDate}
            className="mt-1 block min-h-12 w-full rounded-sm border border-gray-200 px-2 text-xs"
            min={fromDate || undefined}
            data-testid="safety-incidents-to-date"
          />
        </label>
        {driverFilter || unitFilter || fromDate || toDate ? (
          <button
            type="button"
            className="rounded-full border border-gray-300 px-2 py-0.5 text-[11px] text-slate-500 hover:bg-gray-100"
            data-testid={`${config.pageTestId}-filter-clear`}
            onClick={() => {
              setDriverFilter("");
              setUnitFilter("");
              setFromDate("");
              setToDate("");
            }}
          >
            Clear
          </button>
        ) : null}
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
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">
              {createMode ? config.createLabel : config.detailLabel}
            </div>
            <button type="button" className="text-xs text-slate-500 underline" onClick={closeDrawer}>
              Close
            </button>
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
                ) : (
                  <div className="mt-1 text-slate-800">
                    {(detail?.driver_id ? driverNameById.get(String(detail.driver_id)) : "") || "—"}
                  </div>
                )}
              </label>
            ) : null}

            {has("unit_id") ? (
              <label className="block">
                <span className="text-slate-600">Unit</span>
                {formEditable ? (
                  <select
                    className={inputCls}
                    value={str(selected?.unit_id)}
                    data-testid={`${config.pageTestId}-field-unit_id`}
                    onChange={(e) => setField("unit_id", e.target.value)}
                  >
                    <option value="">—</option>
                    {unitOptions.map((u) => (
                      <option key={String(u.id)} value={String(u.id)}>
                        {str(u.unit_number) || "Unit"}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="mt-1 text-slate-800">
                    {str(detail?.unit_number) ||
                      (detail?.unit_id ? unitNumberById.get(String(detail.unit_id)) : "") ||
                      "—"}
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
                  <select
                    className={inputCls}
                    value={str(selected?.trailer_id)}
                    data-testid={`${config.pageTestId}-field-trailer_id`}
                    onChange={(e) => setField("trailer_id", e.target.value)}
                  >
                    <option value="">—</option>
                    {trailerOptions.map((t) => (
                      <option key={String(t.id)} value={String(t.id)}>
                        {str(t.unit_number) || String(t.id)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="mt-1 text-slate-800">
                    {(detail?.trailer_id ? unitNumberById.get(String(detail.trailer_id)) : "") || "—"}
                  </div>
                )}
              </label>
            ) : null}

            {has("load_id") ? (
              <label className="block">
                <span className="text-slate-600">Load</span>
                {formEditable ? (
                  <select
                    className={inputCls}
                    value={str(selected?.load_id)}
                    data-testid={`${config.pageTestId}-field-load_id`}
                    onChange={(e) => setField("load_id", e.target.value)}
                  >
                    <option value="">—</option>
                    {loadOptions.map((l) => (
                      <option key={String(l.id)} value={String(l.id)}>
                        {str(l.load_number) || String(l.id)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="mt-1 text-slate-800">{str(detail?.load_id) || "—"}</div>
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
                  value={str(detail?.location)}
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
                  value={str(detail?.description)}
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
                                setVoidError(err instanceof Error ? err.message : "Void failed.");
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
                {editMode ? (
                  <Button
                    size="sm"
                    data-testid={`${config.pageTestId}-save-edit-btn`}
                    onClick={() => {
                      if (!detail?.id) return;
                      void updateSafetyIncident(String(detail.id), operatingCompanyId, {
                        location: str(detail?.location),
                        description: str(detail?.description),
                        damage_amount_cents: Number(detail?.damage_amount_cents ?? 0),
                      }).then(async () => {
                        setEditMode(false);
                        await queryClient.invalidateQueries({ queryKey: ["safety", "incidents"] });
                      });
                    }}
                  >
                    Save changes
                  </Button>
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
