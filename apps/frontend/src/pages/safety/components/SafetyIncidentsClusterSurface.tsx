import { useMemo, useState } from "react";
import { formatDateUS } from "../../../lib/formatDate";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSafetyIncident,
  getSafetyIncident,
  listSafetyIncidents,
  uploadSafetyIncidentPhoto,
  type SafetyIncidentType,
} from "../../../api/safety";
import { listDrivers, listUnits, listCustomers } from "../../../api/mdata";
import { listLoads } from "../../../api/loads";
import { listCargoClaimReasons } from "../../../api/catalogs-safety";
import { Button } from "../../../components/Button";
import { DatePicker } from "../../../components/forms/DatePicker";
import { companyToday } from "../../../lib/businessDate";

// Declarative per-incident-type field keys. The COMMON set renders for every type;
// `typedFields` on each config adds the type-specific inputs (root-fix: one surface,
// three configs — see BLOCK_SC-CLUSTER-TYPED-CREATORS).
export type IncidentFieldKey =
  | "incident_date"
  | "driver_id"
  | "unit_id"
  | "trailer_id"
  | "load_id"
  | "location"
  | "description"
  | "damage_amount_cents"
  | "interchange_party"
  | "claimant_customer_id"
  | "claim_reason_code"
  | "claim_filed_at";

// Fields shown for ALL three incident types.
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
  // Type-specific fields beyond COMMON_FIELDS (damage amount / interchange party / cargo claim inputs).
  typedFields: IncidentFieldKey[];
  // Extra required fields beyond the always-required date + location + description.
  requiredExtraFields: IncidentFieldKey[];
  // Cargo-claim (SC4) fields that must be FEATURE-DETECTED: only persisted once the SC4
  // backend is live; the create still succeeds (fields stripped) when it is not.
  sc4GatedFields?: IncidentFieldKey[];
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
    damage_amount_dollars: "",
    interchange_party: "",
    claimant_customer_id: "",
    claim_reason_code: "",
    claim_filed_date: "",
  };
}

function toIsoAtNoon(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  const d = new Date(`${dateStr}T12:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function dollarsToCents(dollars: string): number {
  const n = Number.parseFloat(dollars);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function formatUsdCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);
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
  const [sc4Degraded, setSc4Degraded] = useState(false);

  const typedFields = config.typedFields;
  const has = (key: IncidentFieldKey) => COMMON_FIELDS.includes(key) || typedFields.includes(key);

  const listQuery = useQuery({
    queryKey: ["safety", "incidents", config.incidentType, operatingCompanyId],
    queryFn: () => listSafetyIncidents(operatingCompanyId, config.incidentType),
    enabled: Boolean(operatingCompanyId),
  });

  const detailQuery = useQuery({
    queryKey: ["safety", "incident-detail", selected?.id, operatingCompanyId],
    queryFn: () => getSafetyIncident(String(selected?.id), operatingCompanyId),
    enabled:
      drawerOpen && Boolean(selected?.id) && String(selected?.id) !== "__create__" && Boolean(operatingCompanyId),
  });

  const createMode = String(selected?.id ?? "") === "__create__";

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
  const customersQuery = useQuery({
    queryKey: ["safety", "incidents-customers", operatingCompanyId],
    queryFn: () => listCustomers({ operating_company_id: operatingCompanyId, limit: 200 }),
    enabled: createMode && has("claimant_customer_id") && Boolean(operatingCompanyId),
  });
  const reasonsQuery = useQuery({
    queryKey: ["safety", "incidents-cargo-reasons", operatingCompanyId],
    queryFn: () => listCargoClaimReasons(operatingCompanyId, { is_active: "true", limit: 200 }),
    enabled: createMode && has("claim_reason_code") && Boolean(operatingCompanyId),
  });

  const drivers = driversQuery.data?.drivers ?? [];
  const fleetRows = (fleetQuery.data?.units ?? []) as Array<Record<string, unknown>>;
  const unitOptions = fleetRows.filter((r) => str(r.kind) !== "trailer");
  const trailerOptions = fleetRows.filter((r) => str(r.kind) === "trailer");
  const loadOptions = loadsQuery.data?.loads ?? [];
  const customerOptions = customersQuery.data?.customers ?? [];
  const reasonOptions = reasonsQuery.data?.rows ?? [];

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

  const rows = listQuery.data?.incidents ?? [];
  const detail = createMode ? selected : detailQuery.data?.incident ?? selected;

  const openRow = (row: DraftState) => {
    setSelected(row);
    setDrawerOpen(true);
    setSavedHint(false);
    setSc4Degraded(false);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelected(null);
    setSavedHint(false);
    setSc4Degraded(false);
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

    const sentSc4 = Boolean(config.sc4GatedFields && config.sc4GatedFields.length > 0);
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
    if (has("damage_amount_cents")) payload.damage_amount_cents = dollarsToCents(str(selected.damage_amount_dollars));
    if (sentSc4) {
      // FEATURE-DETECT: send SC4 cargo fields only optimistically. If the backend is not live
      // it either strips them (Zod default) or 400s validation_error — both handled gracefully.
      if (has("claim_reason_code") && str(selected.claim_reason_code))
        payload.claim_reason_code = str(selected.claim_reason_code);
      if (has("claimant_customer_id") && str(selected.claimant_customer_id))
        payload.claimant_customer_id = str(selected.claimant_customer_id);
      if (has("claim_filed_at") && str(selected.claim_filed_date))
        payload.claim_filed_at = toIsoAtNoon(str(selected.claim_filed_date));
    }

    setSaving(true);
    try {
      let created: Record<string, unknown> | undefined;
      let sc4Persisted = sentSc4;
      try {
        const res = await createSafetyIncident(payload);
        created = res.incident;
        // If we sent SC4 fields but the row does not echo them, the columns do not exist yet.
        if (sentSc4 && created && !("claim_reason_code" in created)) sc4Persisted = false;
      } catch (err) {
        const message = String((err as Error)?.message ?? "");
        if (sentSc4 && /validation_error/i.test(message)) {
          // SC4 backend rejects the extra fields — retry stripped so the record still saves.
          const { claim_reason_code, claimant_customer_id, claim_filed_at, ...stripped } = payload;
          void claim_reason_code;
          void claimant_customer_id;
          void claim_filed_at;
          const res = await createSafetyIncident(stripped);
          created = res.incident;
          sc4Persisted = false;
        } else {
          throw err;
        }
      }

      refresh();
      if (created?.id) {
        // Post-save photo step: keep the drawer open on the new record in detail mode so the
        // user can add condition/damage photos immediately (the surface supports detail-mode upload).
        setSelected(created as DraftState);
        setSavedHint(true);
        setSc4Degraded(sentSc4 && !sc4Persisted);
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
            setSc4Degraded(false);
          }}
        >
          {config.createLabel}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
        <table className="min-w-full text-xs" data-testid={`${config.pageTestId}-table`}>
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Date</th>
              <th className="px-2 py-1 text-left">Driver</th>
              <th className="px-2 py-1 text-left">Unit</th>
              <th className="px-2 py-1 text-left">Location</th>
              <th className="px-2 py-1 text-left">Status</th>
              <th className="px-2 py-1 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const driverName = row.driver_id ? driverNameById.get(String(row.driver_id)) : "";
              const unitNumber =
                str(row.unit_number) || (row.unit_id ? unitNumberById.get(String(row.unit_id)) : "");
              return (
                <tr
                  key={String(row.id)}
                  className="border-t border-gray-100"
                  data-testid={`${config.pageTestId}-row-${String(row.id)}`}
                >
                  <td className="px-2 py-1">{formatDateUS(row.incident_at)}</td>
                  <td className="px-2 py-1">{driverName || "—"}</td>
                  <td className="px-2 py-1">{unitNumber || "—"}</td>
                  <td className="px-2 py-1">{str(row.location) || "—"}</td>
                  <td className="px-2 py-1">{str(row.status) || "open"}</td>
                  <td className="px-2 py-1">
                    <button type="button" className="text-slate-700 underline" onClick={() => openRow(row)}>
                      {config.detailLabel}
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-3 text-center text-slate-500">
                  No records found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

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
          {sc4Degraded ? (
            <div className="mb-2 text-[11px] text-slate-500" data-testid={`${config.pageTestId}-sc4-pending`}>
              Claim reason, claimant, and filed date will be captured once the cargo-claims backend
              upgrade is live.
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            {has("incident_date") ? (
              <label className="block">
                <span className="text-slate-600">Incident date</span>
                {createMode ? (
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
                {createMode ? (
                  <select
                    className={inputCls}
                    value={str(selected?.driver_id)}
                    data-testid={`${config.pageTestId}-field-driver_id`}
                    onChange={(e) => setField("driver_id", e.target.value)}
                  >
                    <option value="">—</option>
                    {drivers.map((d) => (
                      <option key={String(d.id)} value={String(d.id)}>
                        {`${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() || String(d.id)}
                      </option>
                    ))}
                  </select>
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
                {createMode ? (
                  <select
                    className={inputCls}
                    value={str(selected?.unit_id)}
                    data-testid={`${config.pageTestId}-field-unit_id`}
                    onChange={(e) => setField("unit_id", e.target.value)}
                  >
                    <option value="">—</option>
                    {unitOptions.map((u) => (
                      <option key={String(u.id)} value={String(u.id)}>
                        {str(u.unit_number) || String(u.id)}
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
                {createMode ? (
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
                {createMode ? (
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
                {createMode ? (
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

            {has("claimant_customer_id") ? (
              <label className="block">
                <span className="text-slate-600">Claimant customer</span>
                {createMode ? (
                  <select
                    className={inputCls}
                    value={str(selected?.claimant_customer_id)}
                    data-testid={`${config.pageTestId}-field-claimant_customer_id`}
                    onChange={(e) => setField("claimant_customer_id", e.target.value)}
                  >
                    <option value="">—</option>
                    {customerOptions.map((c) => (
                      <option key={String(c.id)} value={String(c.id)}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="mt-1 text-slate-800">{str(detail?.claimant_customer_id) || "—"}</div>
                )}
              </label>
            ) : null}

            {has("claim_reason_code") ? (
              <label className="block">
                <span className="text-slate-600">Claim reason</span>
                {createMode ? (
                  <select
                    className={inputCls}
                    value={str(selected?.claim_reason_code)}
                    data-testid={`${config.pageTestId}-field-claim_reason_code`}
                    onChange={(e) => setField("claim_reason_code", e.target.value)}
                  >
                    <option value="">—</option>
                    {reasonOptions.map((r) => (
                      <option key={r.id} value={r.reason_code}>
                        {r.display_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="mt-1 text-slate-800">{str(detail?.claim_reason_code) || "—"}</div>
                )}
              </label>
            ) : null}

            {has("claim_filed_at") ? (
              <label className="block">
                <span className="text-slate-600">Claim filed date</span>
                {createMode ? (
                  <DatePicker
                    value={str(selected?.claim_filed_date)}
                    onChange={(v) => setField("claim_filed_date", v)}
                    data-testid={`${config.pageTestId}-field-claim_filed_at`}
                    max={companyToday()}
                  />
                ) : (
                  <div className="mt-1 text-slate-800">{formatDateUS(detail?.claim_filed_at)}</div>
                )}
              </label>
            ) : null}

            {has("damage_amount_cents") ? (
              <label className="block">
                <span className="text-slate-600">
                  {config.incidentType === "cargo_claim" ? "Claimed amount" : "Estimated damage amount"}
                </span>
                {createMode ? (
                  <div className="mt-1 flex items-center gap-1">
                    <span className="text-slate-500">$</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
                      value={str(selected?.damage_amount_dollars)}
                      data-testid={`${config.pageTestId}-field-damage_amount_cents`}
                      onChange={(e) => setField("damage_amount_dollars", e.target.value)}
                    />
                    <span className="text-[11px] text-slate-400">
                      {formatUsdCents(dollarsToCents(str(selected?.damage_amount_dollars)))}
                    </span>
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
                  disabled={!createMode}
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
                  disabled={!createMode}
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
