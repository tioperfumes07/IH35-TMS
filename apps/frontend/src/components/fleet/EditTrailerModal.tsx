import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { patchTrailer } from "../../api/fleet-trailers";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { FormField } from "../forms/FormField";
import { FieldSet } from "../forms/FieldSet";

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

const inputClass = "h-8 w-full rounded border border-gray-300 px-2 text-xs";

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

  useEffect(() => {
    if (!equipment) return;
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
    };
    setBaseline(next);
    setDraft(next);
  }, [equipment?.id, primaryPlate?.id]);

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
    return patch;
  }, [draft, baseline]);

  const saveMutation = useMutation({
    mutationFn: () => patchTrailer(trailerId, operatingCompanyId, patchPayload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trailer-profile", trailerId, operatingCompanyId] });
      void queryClient.invalidateQueries({ queryKey: ["edit-trailer-modal", trailerId, operatingCompanyId] });
      onSaved?.();
      onClose();
    },
  });

  const set = (key: string, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <Modal open={open} title="Edit trailer" onClose={onClose}>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto text-sm" data-testid="tp-edit-trailer-modal">
        {profileQuery.isLoading ? <p>Loading…</p> : null}
        <FieldSet legend="Identity">
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
        </FieldSet>
        <FieldSet legend="Specs">
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
        <FieldSet legend="Registration (primary plate)">
          <FormField label="Plate" name="plate_number">
            <input id="plate_number" className={inputClass} value={draft.plate_number ?? ""} onChange={(e) => set("plate_number", e.target.value)} readOnly />
          </FormField>
          <FormField label="State / jurisdiction" name="plate_jurisdiction">
            <input id="plate_jurisdiction" className={inputClass} value={draft.plate_jurisdiction ?? ""} onChange={(e) => set("plate_jurisdiction", e.target.value)} readOnly />
          </FormField>
          <FormField label="Registration expiry" name="plate_expiration">
            <input id="plate_expiration" type="date" className={inputClass} value={draft.plate_expiration ?? ""} onChange={(e) => set("plate_expiration", e.target.value)} readOnly />
          </FormField>
          <p className="text-xs text-gray-500">Edit plates in the Compliance section (multi-jurisdiction).</p>
        </FieldSet>
        <FieldSet legend="Insurance">
          <FormField label="US policy reference" name="us_insurance_policy_number">
            <input
              id="us_insurance_policy_number"
              className={inputClass}
              value={draft.us_insurance_policy_number ?? ""}
              onChange={(e) => set("us_insurance_policy_number", e.target.value)}
            />
          </FormField>
          <FormField label="US expiration" name="us_insurance_expiration">
            <input
              id="us_insurance_expiration"
              type="date"
              className={inputClass}
              value={draft.us_insurance_expiration ?? ""}
              onChange={(e) => set("us_insurance_expiration", e.target.value)}
            />
          </FormField>
        </FieldSet>
        <FormField label="Notes" name="notes">
          <textarea id="notes" className={`${inputClass} min-h-[4rem] py-1`} value={draft.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            loading={saveMutation.isPending}
            disabled={Object.keys(patchPayload).length === 0}
            onClick={() => saveMutation.mutate()}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
