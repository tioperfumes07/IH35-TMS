import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../../components/Button";
import { Combobox, type ComboboxOption } from "../../../components/Combobox";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { companyNow } from "../../../lib/businessDate";
import { createSafetyIncident, uploadSafetyIncidentPhoto } from "../../../api/safety";
import { listDrivers, listUnits } from "../../../api/mdata";
import { listLoads } from "../../../api/loads";
import type { Driver } from "../../../types/api";

// SC2 — full damage-report creator wired to the finished safety.incidents API.
// Captures the McLeod/Alvys damage-event keys (driver + unit + date + amount + photos) that an
// insurance claim, a chargeback, or a driver damage-claim-escrow deduction all depend on — a
// location+description free-text record cannot support any of them.
//
// TRAILER (spec field #4) is intentionally NOT written here: the schema FK is
// `safety.incidents.trailer_id -> mdata.units(id)`, but this fleet's trailers live ONLY in
// mdata.equipment (see migration 202606161400 — mdata.units is trucks/tractors). Sending an
// equipment id would violate the FK and 500; sending a truck id would be semantically wrong.
// Rather than ship a silently-dead control, the field is surfaced with a visible note and left
// unwired until the backend FK is re-pointed (out of this Tier-3 frontend lane). Flagged to GUARD.

type Props = {
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: () => void;
};

type Step = "form" | "photos";

const MAX_PHOTOS = 10;

function driverLabel(d: Driver): string {
  const name = `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim();
  return name || String(d.id);
}

export function DamageReportCreatorModal({ operatingCompanyId, onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>("form");
  const [incidentId, setIncidentId] = useState<string | null>(null);

  // Form state
  const [incidentAtLocal, setIncidentAtLocal] = useState<string>(() => companyNow());
  const [driverId, setDriverId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [loadId, setLoadId] = useState<string | null>(null);
  const [location, setLocation] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [damageCents, setDamageCents] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Photos state
  const [photoKeys, setPhotoKeys] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const enablePickers = Boolean(operatingCompanyId);

  // Driver picker MUST pass limit:200 (default-50 silently drops active drivers past the newest 50)
  // and operating_company_id is REQUIRED (unscoped read fail-closes to 0 rows).
  const driversQuery = useQuery({
    queryKey: ["safety", "damage-creator", "drivers", operatingCompanyId],
    queryFn: () => listDrivers({ operating_company_id: operatingCompanyId, status: "Active", limit: 200 }),
    enabled: enablePickers,
  });

  const unitsQuery = useQuery({
    queryKey: ["safety", "damage-creator", "units", operatingCompanyId],
    queryFn: () => listUnits({ operating_company_id: operatingCompanyId, limit: 200 }),
    enabled: enablePickers,
  });

  const loadsQuery = useQuery({
    queryKey: ["safety", "damage-creator", "loads", operatingCompanyId],
    queryFn: () => listLoads({ operating_company_id: [operatingCompanyId], limit: 200 }),
    enabled: enablePickers,
  });

  const driverOptions: ComboboxOption[] = useMemo(
    () => (driversQuery.data?.drivers ?? []).map((d) => ({ value: String(d.id), label: driverLabel(d) })),
    [driversQuery.data]
  );

  const unitOptions: ComboboxOption[] = useMemo(
    () =>
      (unitsQuery.data?.units ?? []).map((u) => {
        const row = u as { id: string; unit_number?: string | null };
        return { value: String(row.id), label: String(row.unit_number ?? row.id) };
      }),
    [unitsQuery.data]
  );

  const loadOptions: ComboboxOption[] = useMemo(
    () =>
      (loadsQuery.data?.loads ?? []).map((l) => ({
        value: String(l.id),
        label: String(l.load_number ?? l.id),
        sublabel: l.customer_name ?? undefined,
      })),
    [loadsQuery.data]
  );

  const canSubmit = incidentAtLocal.trim() !== "" && location.trim() !== "" && description.trim() !== "";

  const submit = async () => {
    setError(null);
    if (!canSubmit) {
      setError("Date, location, and description are required.");
      return;
    }
    // Office staff can log third-party property damage that involves no unit/driver — but confirm the
    // omission so a claim-relevant linkage is never dropped by accident.
    if (!driverId && !unitId) {
      const ok = window.confirm("Save without a linked driver or unit?");
      if (!ok) return;
    }

    let incidentAtIso: string;
    try {
      incidentAtIso = new Date(incidentAtLocal).toISOString();
    } catch {
      setError("Invalid date/time.");
      return;
    }

    setSaving(true);
    try {
      const res = await createSafetyIncident({
        operating_company_id: operatingCompanyId,
        incident_type: "damage_report",
        incident_at: incidentAtIso,
        location: location.trim(),
        description: description.trim(),
        driver_id: driverId,
        unit_id: unitId,
        load_id: loadId,
        damage_amount_cents: damageCents ?? 0,
      });
      const newId = res.incident?.id ? String(res.incident.id) : null;
      setIncidentId(newId);
      onCreated();
      setStep("photos");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create damage report.");
    } finally {
      setSaving(false);
    }
  };

  const onPhotoSelected = async (file: File | null) => {
    if (!file || !incidentId) return;
    if (photoKeys.length >= MAX_PHOTOS) {
      setPhotoError(`Maximum ${MAX_PHOTOS} photos reached.`);
      return;
    }
    setPhotoError(null);
    setUploading(true);
    try {
      const res = await uploadSafetyIncidentPhoto(incidentId, operatingCompanyId, file);
      const keys = (res as { photo_keys?: unknown }).photo_keys;
      if (Array.isArray(keys)) setPhotoKeys(keys.map((k) => String(k)));
      else setPhotoKeys((prev) => [...prev, String((res as { photo_key?: unknown }).photo_key ?? "photo")]);
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : "Photo upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      data-testid="damage-report-creator-modal"
    >
      <div className="mt-8 w-full max-w-lg rounded-sm border border-gray-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
          <div className="text-sm font-semibold text-slate-800">
            {step === "form" ? "+ Create damage report" : "Report saved — add photos"}
          </div>
          <button type="button" className="text-xs text-slate-500 underline" onClick={onClose}>
            Close
          </button>
        </div>

        {step === "form" ? (
          <div className="space-y-3 px-4 py-3 text-xs">
            <label className="block">
              <span className="text-slate-600">
                Date / time of damage <span className="text-red-600">*</span>
              </span>
              <input
                type="datetime-local"
                data-testid="damage-report-incident-at"
                className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1"
                value={incidentAtLocal}
                onChange={(e) => setIncidentAtLocal(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-slate-600">Driver</span>
              <div className="mt-1">
                <Combobox
                  options={driverOptions}
                  value={driverId}
                  onChange={setDriverId}
                  loading={driversQuery.isLoading}
                  allowClear
                  placeholder="Select driver"
                  dataField="damage-driver"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-slate-600">Unit (truck)</span>
              <div className="mt-1">
                <Combobox
                  options={unitOptions}
                  value={unitId}
                  onChange={setUnitId}
                  loading={unitsQuery.isLoading}
                  allowClear
                  placeholder="Select unit"
                  dataField="damage-unit"
                />
              </div>
            </label>

            <div className="block">
              <span className="text-slate-600">Trailer</span>
              <input
                className="mt-1 w-full cursor-not-allowed rounded-sm border border-gray-200 bg-gray-100 px-2 py-1 text-gray-400"
                value=""
                disabled
                placeholder="Unavailable — see note"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Trailer link is pending a backend fix: the incidents FK targets mdata.units, but
                trailers live in mdata.equipment. Not saved yet (flagged for GUARD).
              </p>
            </div>

            <label className="block">
              <span className="text-slate-600">Load (optional)</span>
              <div className="mt-1">
                <Combobox
                  options={loadOptions}
                  value={loadId}
                  onChange={setLoadId}
                  loading={loadsQuery.isLoading}
                  allowClear
                  placeholder="Select load"
                  dataField="damage-load"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-slate-600">
                Location <span className="text-red-600">*</span>
              </span>
              <input
                data-testid="damage-report-location"
                className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-slate-600">
                Description <span className="text-red-600">*</span>
              </span>
              <textarea
                data-testid="damage-report-description"
                className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>

            <label className="block">
              <span className="text-slate-600">Estimated damage amount</span>
              <div className="mt-1 w-40">
                <MoneyInput
                  valueCents={damageCents}
                  onChangeCents={setDamageCents}
                  ariaLabel="Estimated damage amount"
                />
              </div>
            </label>

            {error ? (
              <p className="text-[11px] text-red-600" data-testid="damage-report-error">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="text-xs text-slate-500 underline" onClick={onClose}>
                Cancel
              </button>
              <Button size="sm" disabled={!canSubmit || saving} onClick={() => void submit()}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 px-4 py-3 text-xs">
            <p className="text-slate-600">
              Damage report saved. Add up to {MAX_PHOTOS} photos as evidence, then close.
            </p>
            <div className="text-slate-600">Photos ({photoKeys.length}/{MAX_PHOTOS})</div>
            <input
              type="file"
              accept="image/*"
              data-testid="damage-report-photo-input"
              disabled={uploading || photoKeys.length >= MAX_PHOTOS}
              onChange={(e) => void onPhotoSelected(e.target.files?.[0] ?? null)}
            />
            {photoKeys.length > 0 ? (
              <ul className="space-y-1 text-[11px] text-slate-500">
                {photoKeys.map((k) => (
                  <li key={k} className="truncate">
                    {k}
                  </li>
                ))}
              </ul>
            ) : null}
            {photoError ? <p className="text-[11px] text-red-600">{photoError}</p> : null}
            <div className="flex justify-end pt-1">
              <Button size="sm" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
