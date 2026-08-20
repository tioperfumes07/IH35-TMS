import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { patchTrailer } from "../../api/fleet-trailers";
import { listMyCompanies, type MyCompany } from "../../api/org";
import { useToast } from "../../components/Toast";
import { DatePicker } from "../../components/forms/DatePicker";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { Combobox } from "../Combobox";
import { FormField } from "../forms/FormField";
import { FieldSet } from "../forms/FieldSet";

function companyPickerLabel(c: MyCompany): string {
  const name = (c.short_name ?? c.legal_name ?? "").trim();
  return name ? `${c.code} · ${name}` : c.code;
}

const EQUIPMENT_TYPES = [
  "DryVan", "Reefer", "Flatbed", "Tanker", "Container", "Chassis", "StepDeck", "Lowboy", "Conestoga", "RGN", "Other",
] as const;

type Props = {
  open: boolean;
  trailerId: string;
  operatingCompanyId: string;
  onClose: () => void;
  onSaved?: () => void;
};

type TrailerRow = Record<string, unknown>;

function str(v: unknown) {
  return v == null ? "" : String(v);
}

const inputClass = "h-8 w-full rounded-sm border border-gray-300 px-2 text-xs";

export function EditTrailerModal({ open, trailerId, operatingCompanyId, onClose, onSaved }: Props) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [baseline, setBaseline] = useState<Record<string, string>>({});

  const profileQuery = useQuery({
    queryKey: ["edit-trailer-modal", trailerId, operatingCompanyId],
    queryFn: () =>
      apiRequest<{ equipment: TrailerRow; type_specs: TrailerRow; plates: TrailerRow[] }>(
        `/api/v1/mdata/equipment/${trailerId}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
      ),
    enabled: open && Boolean(trailerId && operatingCompanyId),
  });

  const equipment = profileQuery.data?.equipment;
  const primaryPlate = profileQuery.data?.plates?.[0];

  // Leased To Company picker — trailer ownership is locked to TRK for every row (LST-F27 owner
  // ruling), so there is deliberately no Owner Company field here, unlike EditVehicleModal (units).
  // Leased To is a real, editable Combobox: an operator reassigning a trailer to a different
  // operating company's roster needs a way to do that from this modal.
  const companiesQuery = useQuery({
    queryKey: ["org", "me-companies", "edit-trailer"],
    queryFn: () => listMyCompanies().then((r) => r.companies ?? []),
    enabled: open,
    staleTime: 120_000,
  });
  const companyOptions = useMemo(
    () =>
      (companiesQuery.data ?? [])
        .filter((c) => c.is_active)
        .map((c) => ({ value: c.id, label: companyPickerLabel(c) })),
    [companiesQuery.data]
  );

  // Initialize once per open so a refetch can't reset the form + wipe edits.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!open) initializedRef.current = false;
  }, [open]);
  useEffect(() => {
    if (!equipment || initializedRef.current) return;
    const next: Record<string, string> = {
      equipment_number: str(equipment.equipment_number),
      vin: str(equipment.vin),
      year: str(equipment.year),
      make: str(equipment.make),
      model: str(equipment.model),
      equipment_type: str(equipment.equipment_type),
      length_ft: str(equipment.length_ft),
      max_payload_lbs: str(equipment.max_payload_lbs),
      axle_count: str(equipment.axle_count),
      plate_number: str(primaryPlate?.plate_number),
      plate_expiration: str(primaryPlate?.expiration).slice(0, 10),
      plate_jurisdiction: str(primaryPlate?.jurisdiction),
      us_insurance_policy_number: str(equipment.us_insurance_policy_number),
      us_insurance_expiration: str(equipment.us_insurance_expiration).slice(0, 10),
      notes: str(equipment.notes),
      currently_leased_to_company_id: str(equipment.currently_leased_to_company_id),
    };
    setBaseline(next);
    setDraft(next);
    initializedRef.current = true;
  }, [equipment, primaryPlate]);

  const patchPayload = useMemo(() => {
    const patch: Record<string, unknown> = {};
    const num = (k: string) => {
      const raw = draft[k]?.trim();
      if (!raw) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };
    if (draft.equipment_number !== baseline.equipment_number) patch.equipment_number = draft.equipment_number;
    if (draft.vin !== baseline.vin) patch.vin = draft.vin || null;
    if (draft.year !== baseline.year) patch.year = num("year");
    if (draft.make !== baseline.make) patch.make = draft.make || null;
    if (draft.model !== baseline.model) patch.model = draft.model || null;
    if (draft.equipment_type !== baseline.equipment_type) patch.equipment_type = draft.equipment_type;
    if (draft.length_ft !== baseline.length_ft) patch.length_ft = num("length_ft");
    if (draft.max_payload_lbs !== baseline.max_payload_lbs) patch.max_payload_lbs = num("max_payload_lbs");
    if (draft.axle_count !== baseline.axle_count) patch.axle_count = num("axle_count");
    if (draft.us_insurance_policy_number !== baseline.us_insurance_policy_number) {
      patch.us_insurance_policy_number = draft.us_insurance_policy_number || null;
    }
    if (draft.us_insurance_expiration !== baseline.us_insurance_expiration) {
      patch.us_insurance_expiration = draft.us_insurance_expiration || null;
    }
    if (draft.notes !== baseline.notes) patch.notes = draft.notes || null;
    if (draft.currently_leased_to_company_id !== baseline.currently_leased_to_company_id) {
      patch.currently_leased_to_company_id = draft.currently_leased_to_company_id || null;
    }
    return patch;
  }, [draft, baseline]);

  const { pushToast } = useToast();
  const saveMutation = useMutation({
    mutationFn: () => patchTrailer(trailerId, operatingCompanyId, patchPayload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trailer-profile", trailerId, operatingCompanyId] });
      void queryClient.invalidateQueries({ queryKey: ["edit-trailer-modal", trailerId, operatingCompanyId] });
      onSaved?.();
      onClose();
    },
    onError: (e) => pushToast(e instanceof Error ? e.message : "Failed to save trailer", "error"),
  });

  const set = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <Modal open={open} title="Edit trailer" onClose={onClose}>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto text-sm" data-testid="tp-edit-trailer-modal">
        {profileQuery.isLoading ? <p>Loading…</p> : null}
        <FieldSet title="Identity">
          <FormField label="Trailer #" name="equipment_number">
            <input id="equipment_number" className={inputClass} value={draft.equipment_number ?? ""} onChange={(e) => set("equipment_number", e.target.value)} />
          </FormField>
          <FormField label="VIN" name="vin">
            <input id="vin" className={inputClass} value={draft.vin ?? ""} onChange={(e) => set("vin", e.target.value)} />
          </FormField>
          <FormField label="Year" name="year">
            <input id="year" type="number" className={inputClass} value={draft.year ?? ""} onChange={(e) => set("year", e.target.value)} />
          </FormField>
          <FormField label="Make" name="make">
            <input id="make" className={inputClass} value={draft.make ?? ""} onChange={(e) => set("make", e.target.value)} />
          </FormField>
          <FormField label="Model" name="model">
            <input id="model" className={inputClass} value={draft.model ?? ""} onChange={(e) => set("model", e.target.value)} />
          </FormField>
          <FormField label="Equipment type" name="equipment_type">
            <select id="equipment_type" className={inputClass} value={draft.equipment_type ?? "DryVan"} onChange={(e) => set("equipment_type", e.target.value)}>
              {EQUIPMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Leased To Company" name="currently_leased_to_company_id">
            <div data-testid="edit-trailer-currently_leased_to_company_id">
              <Combobox
                options={companyOptions}
                value={draft.currently_leased_to_company_id || null}
                onChange={(v) => set("currently_leased_to_company_id", v ?? "")}
                placeholder="Select company"
                loading={companiesQuery.isLoading}
                allowClear
                dataField="currently_leased_to_company_id"
              />
            </div>
          </FormField>
        </FieldSet>
        <FieldSet title="Specs">
          <FormField label="Length (ft)" name="length_ft">
            <input id="length_ft" type="number" className={inputClass} value={draft.length_ft ?? ""} onChange={(e) => set("length_ft", e.target.value)} />
          </FormField>
          <FormField label="Max payload (lbs)" name="max_payload_lbs">
            <input id="max_payload_lbs" type="number" className={inputClass} value={draft.max_payload_lbs ?? ""} onChange={(e) => set("max_payload_lbs", e.target.value)} />
          </FormField>
          <FormField label="Axles" name="axle_count">
            <input id="axle_count" type="number" className={inputClass} value={draft.axle_count ?? ""} onChange={(e) => set("axle_count", e.target.value)} />
          </FormField>
        </FieldSet>
        <FieldSet title="Registration (primary plate)">
          <FormField label="Plate" name="plate_number">
            <input id="plate_number" className={inputClass} value={draft.plate_number ?? ""} onChange={(e) => set("plate_number", e.target.value)} readOnly />
          </FormField>
          <FormField label="State / jurisdiction" name="plate_jurisdiction">
            <input id="plate_jurisdiction" className={inputClass} value={draft.plate_jurisdiction ?? ""} onChange={(e) => set("plate_jurisdiction", e.target.value)} readOnly />
          </FormField>
          <FormField label="Registration expiry" name="plate_expiration">
            <DatePicker id="plate_expiration" className={inputClass} value={draft.plate_expiration ?? ""} onChange={(v) => set("plate_expiration", v)} disabled />
          </FormField>
          <p className="text-xs text-gray-500">Edit plates in the Compliance section (multi-jurisdiction).</p>
        </FieldSet>
        <FieldSet title="Insurance">
          <FormField label="US policy reference" name="us_insurance_policy_number">
            <input
              id="us_insurance_policy_number"
              className={inputClass}
              value={draft.us_insurance_policy_number ?? ""}
              onChange={(e) => set("us_insurance_policy_number", e.target.value)}
            />
          </FormField>
          <FormField label="US expiration" name="us_insurance_expiration">
            <DatePicker
              id="us_insurance_expiration"
              value={draft.us_insurance_expiration ?? ""}
              onChange={(v) => set("us_insurance_expiration", v)}
            />
          </FormField>
        </FieldSet>
        <FormField label="Notes" name="notes">
          <textarea id="notes" className={`${inputClass} min-h-16 py-1`} value={draft.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            loading={saveMutation.isPending}
            onClick={() => {
              if (Object.keys(patchPayload).length === 0) {
                onClose();
                return;
              }
              saveMutation.mutate();
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
