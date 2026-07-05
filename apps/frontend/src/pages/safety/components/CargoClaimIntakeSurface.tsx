import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSafetyIncident,
  getSafetyIncident,
  listSafetyIncidents,
  uploadSafetyIncidentPhoto,
} from "../../../api/safety";
import { listCargoClaimReasons } from "../../../api/catalogs-safety";
import { listCustomers, listDrivers, listUnits } from "../../../api/mdata";
import { listLoads } from "../../../api/loads";
import { Button } from "../../../components/Button";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { formatDateUS } from "../../../lib/formatDate";
import { companyNow } from "../../../lib/businessDate";
import { useListState } from "../../../components/list-state";
import { formatUsdCents } from "../../../lib/money";

type Props = {
  operatingCompanyId: string;
  pageTestId: string;
  createLabel: string;
  detailLabel: string;
  title: string;
  subtitle: string;
};

type UnifiedUnit = { id: string; unit_number?: string | null; kind?: "truck" | "trailer" };

const PICKER_LIMIT = 200;

function todayISODate(): string {
  // companyNow() is an ISO timestamp; take the calendar date portion for the date input.
  return String(companyNow()).slice(0, 10);
}

function formatCents(cents: unknown): string {
  const n = typeof cents === "number" ? cents : Number(cents ?? 0);
  return formatUsdCents(n);
}

const emptyForm = {
  incidentDate: todayISODate(),
  loadId: "",
  claimantCustomerId: "",
  claimReasonCode: "",
  amountCents: null as number | null,
  amountUndetermined: false,
  claimFiledAt: "",
  driverId: "",
  unitId: "",
  trailerId: "",
  location: "",
  description: "",
};

export function CargoClaimIntakeSurface({
  operatingCompanyId,
  pageTestId,
  createLabel,
  detailLabel,
  title,
  subtitle,
}: Props) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const companyEnabled = Boolean(operatingCompanyId);

  const listQuery = useQuery({
    queryKey: ["safety", "incidents", "cargo_claim", operatingCompanyId],
    queryFn: () => listSafetyIncidents(operatingCompanyId, "cargo_claim"),
    enabled: companyEnabled,
  });

  const reasonsQuery = useQuery({
    queryKey: ["catalogs", "cargo-claim-reasons", operatingCompanyId],
    queryFn: () => listCargoClaimReasons(operatingCompanyId, { is_active: "true", limit: PICKER_LIMIT }),
    enabled: creating && companyEnabled,
  });

  const customersQuery = useQuery({
    queryKey: ["mdata", "customers", "cargo-claim-picker", operatingCompanyId],
    queryFn: () => listCustomers({ operating_company_id: operatingCompanyId, limit: PICKER_LIMIT }),
    enabled: creating && companyEnabled,
  });

  const loadsQuery = useQuery({
    queryKey: ["mdata", "loads", "cargo-claim-picker", operatingCompanyId],
    queryFn: () => listLoads({ operating_company_id: [operatingCompanyId], limit: PICKER_LIMIT, sort: "-created_at" }),
    enabled: creating && companyEnabled,
  });

  const driversQuery = useQuery({
    queryKey: ["mdata", "drivers", "cargo-claim-picker", operatingCompanyId],
    queryFn: () => listDrivers({ operating_company_id: operatingCompanyId, limit: PICKER_LIMIT }),
    enabled: creating && companyEnabled,
  });

  const unitsQuery = useQuery({
    queryKey: ["mdata", "units", "cargo-claim-picker", operatingCompanyId],
    queryFn: () => listUnits({ operating_company_id: operatingCompanyId, limit: PICKER_LIMIT, include: "trailers" }),
    enabled: creating && companyEnabled,
  });

  const detailQuery = useQuery({
    queryKey: ["safety", "incident-detail", selectedId, operatingCompanyId],
    queryFn: () => getSafetyIncident(String(selectedId), operatingCompanyId),
    enabled: Boolean(selectedId) && companyEnabled,
  });

  const rows = listQuery.data?.incidents ?? [];
  // LIST-EMPTY: the empty message renders only after the incidents query settles.
  const listState = useListState(listQuery, rows.length === 0);
  const reasons = reasonsQuery.data?.rows ?? [];
  const customers = customersQuery.data?.customers ?? [];
  const loads = loadsQuery.data?.loads ?? [];
  const drivers = driversQuery.data?.drivers ?? [];
  const allUnits = (unitsQuery.data?.units ?? []) as UnifiedUnit[];
  const trucks = useMemo(() => allUnits.filter((u) => u.kind !== "trailer"), [allUnits]);
  const trailers = useMemo(() => allUnits.filter((u) => u.kind === "trailer"), [allUnits]);

  const detail = detailQuery.data?.incident ?? null;
  const photoCount = Array.isArray(detail?.photo_keys) ? (detail?.photo_keys as unknown[]).length : 0;

  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const resetCreate = () => {
    setForm({ ...emptyForm, incidentDate: todayISODate() });
    setError(null);
    setCreating(false);
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["safety", "incidents", "cargo_claim", operatingCompanyId] });
  };

  const saveCreate = async () => {
    setError(null);
    if (!form.incidentDate) {
      setError("Date of loss is required.");
      return;
    }
    if (!form.description.trim()) {
      setError("Description is required.");
      return;
    }
    const cents = form.amountCents;
    if (!form.amountUndetermined && (cents === null || cents <= 0)) {
      setError('Enter a claimed amount, or check "Amount undetermined" (49 CFR 1005.2 allows a determinable amount).');
      return;
    }
    // 49 CFR 1005.2 requires the claim to identify the shipment. Strongly prompt when no load is linked.
    if (!form.loadId) {
      const proceed = window.confirm(
        "A cargo claim without a shipment cannot satisfy 49 CFR 1005.2 — continue?"
      );
      if (!proceed) return;
    }

    setSaving(true);
    try {
      const incidentAtIso = new Date(`${form.incidentDate}T12:00:00`).toISOString();
      const created = await createSafetyIncident({
        operating_company_id: operatingCompanyId,
        incident_type: "cargo_claim",
        incident_at: incidentAtIso,
        location: form.location,
        description: form.description,
        load_id: form.loadId || null,
        claimant_customer_id: form.claimantCustomerId || null,
        claim_reason_code: form.claimReasonCode || null,
        claim_filed_at: form.claimFiledAt || null,
        damage_amount_cents: form.amountUndetermined ? 0 : cents ?? 0, // dollars→cents via MoneyInput
        driver_id: form.driverId || null,
        unit_id: form.unitId || null,
        trailer_id: form.trailerId || null,
      });
      const newId = created?.incident?.id ? String(created.incident.id) : null;
      resetCreate();
      refresh();
      if (newId) setSelectedId(newId); // open detail so the office can attach photos immediately
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the cargo claim.");
    } finally {
      setSaving(false);
    }
  };

  const onPhotoSelected = async (file: File | null) => {
    if (!file || !selectedId) return;
    setUploading(true);
    try {
      await uploadSafetyIncidentPhoto(selectedId, operatingCompanyId, file);
      void detailQuery.refetch();
    } finally {
      setUploading(false);
    }
  };

  const inputClass = "mt-1 w-full rounded-sm border border-gray-200 px-2 py-1";
  const labelSpan = "text-slate-600";

  return (
    <div className="space-y-3" data-testid={pageTestId}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 bg-white px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">{title}</div>
          <div className="text-[11px] text-slate-500">{subtitle}</div>
        </div>
        {!creating ? (
          <Button
            size="sm"
            data-testid={`${pageTestId}-create-btn`}
            onClick={() => {
              setForm({ ...emptyForm, incidentDate: todayISODate() });
              setSelectedId(null);
              setError(null);
              setCreating(true);
            }}
          >
            {createLabel}
          </Button>
        ) : null}
      </div>

      {creating ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid={`${pageTestId}-create-form`}>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">{createLabel}</div>
            <button type="button" className="text-xs text-slate-500 underline" onClick={resetCreate}>
              Cancel
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
            <label className="block">
              <span className={labelSpan}>Date of loss *</span>
              <input
                type="date"
                className={inputClass}
                data-testid={`${pageTestId}-incident-at`}
                value={form.incidentDate}
                onChange={(e) => set({ incidentDate: e.target.value })}
              />
            </label>
            <label className="block">
              <span className={labelSpan}>Load (shipment)</span>
              <select
                className={inputClass}
                data-testid={`${pageTestId}-load`}
                value={form.loadId}
                onChange={(e) => set({ loadId: e.target.value })}
              >
                <option value="">— Select load —</option>
                {loads.map((load) => (
                  <option key={load.id} value={load.id}>
                    {load.load_number}
                    {load.customer_name ? ` · ${load.customer_name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelSpan}>Claimant (customer)</span>
              <select
                className={inputClass}
                data-testid={`${pageTestId}-claimant`}
                value={form.claimantCustomerId}
                onChange={(e) => set({ claimantCustomerId: e.target.value })}
              >
                <option value="">— Select customer —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelSpan}>Claim reason</span>
              <select
                className={inputClass}
                data-testid={`${pageTestId}-reason`}
                value={form.claimReasonCode}
                onChange={(e) => set({ claimReasonCode: e.target.value })}
              >
                <option value="">— Select reason —</option>
                {reasons.map((r) => (
                  <option key={r.id} value={r.reason_code}>
                    {r.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelSpan}>Claimed amount</span>
              <div className="mt-1" data-testid={`${pageTestId}-amount`}>
                <MoneyInput
                  ariaLabel="Claimed amount"
                  valueCents={form.amountCents}
                  onChangeCents={(c) => set({ amountCents: c })}
                  disabled={form.amountUndetermined}
                />
              </div>
              <label className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                <input
                  type="checkbox"
                  data-testid={`${pageTestId}-amount-undetermined`}
                  checked={form.amountUndetermined}
                  onChange={(e) => set({ amountUndetermined: e.target.checked })}
                />
                Amount undetermined (determinable)
              </label>
            </label>
            <label className="block">
              <span className={labelSpan}>Claim filed date</span>
              <input
                type="date"
                className={inputClass}
                data-testid={`${pageTestId}-filed-at`}
                value={form.claimFiledAt}
                onChange={(e) => set({ claimFiledAt: e.target.value })}
              />
            </label>
            <label className="block">
              <span className={labelSpan}>Driver</span>
              <select className={inputClass} value={form.driverId} onChange={(e) => set({ driverId: e.target.value })}>
                <option value="">— Select driver —</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.first_name} {d.last_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelSpan}>Unit (truck)</span>
              <select className={inputClass} value={form.unitId} onChange={(e) => set({ unitId: e.target.value })}>
                <option value="">— Select unit —</option>
                {trucks.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unit_number ?? u.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelSpan}>Trailer</span>
              <select className={inputClass} value={form.trailerId} onChange={(e) => set({ trailerId: e.target.value })}>
                <option value="">— Select trailer —</option>
                {trailers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unit_number ?? u.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelSpan}>Location</span>
              <input className={inputClass} value={form.location} onChange={(e) => set({ location: e.target.value })} />
            </label>
            <label className="block md:col-span-2">
              <span className={labelSpan}>Description *</span>
              <textarea
                className={inputClass}
                rows={3}
                data-testid={`${pageTestId}-description`}
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
              />
            </label>
          </div>
          {error ? (
            <div className="mt-2 text-[11px] text-red-600" data-testid={`${pageTestId}-error`}>
              {error}
            </div>
          ) : null}
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" data-testid={`${pageTestId}-save`} loading={saving} onClick={() => void saveCreate()}>
              Save
            </Button>
            <button type="button" className="text-xs text-slate-500 underline" onClick={resetCreate}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
        <table className="min-w-full text-xs" data-testid={`${pageTestId}-table`}>
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Date of loss</th>
              <th className="px-2 py-1 text-left">Reason</th>
              <th className="px-2 py-1 text-left">Claimed</th>
              <th className="px-2 py-1 text-left">Status</th>
              <th className="px-2 py-1 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)} className="border-t border-gray-100">
                <td className="px-2 py-1">{formatDateUS(row.incident_at)}</td>
                <td className="px-2 py-1">{String(row.claim_reason_code ?? "—")}</td>
                <td className="px-2 py-1">{formatCents(row.damage_amount_cents)}</td>
                <td className="px-2 py-1">{String(row.status ?? "open")}</td>
                <td className="px-2 py-1">
                  <button type="button" className="text-slate-700 underline" onClick={() => setSelectedId(String(row.id))}>
                    {detailLabel}
                  </button>
                </td>
              </tr>
            ))}
            {listState.isEmpty ? (
              <tr>
                <td colSpan={5} className="px-2 py-3 text-center text-slate-500">
                  No records found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedId ? (
        <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid={`${pageTestId}-detail`}>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">{detailLabel}</div>
            <button type="button" className="text-xs text-slate-500 underline" onClick={() => setSelectedId(null)}>
              Close
            </button>
          </div>
          <div className="space-y-1 text-xs text-slate-700">
            <div>Date of loss: {detail ? formatDateUS(detail.incident_at) : "—"}</div>
            <div>Reason: {String(detail?.claim_reason_code ?? "—")}</div>
            <div>Claimed: {formatCents(detail?.damage_amount_cents)}</div>
            <div>Filed: {detail?.claim_filed_at ? formatDateUS(detail.claim_filed_at) : "—"}</div>
            <div>Description: {String(detail?.description ?? "—")}</div>
            <div className="pt-1">
              <div className="text-slate-600">Photos ({photoCount})</div>
              <input
                type="file"
                accept="image/*"
                data-testid={`${pageTestId}-photo-input`}
                disabled={uploading}
                onChange={(e) => void onPhotoSelected(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
