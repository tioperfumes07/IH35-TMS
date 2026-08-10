import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createEquipment, type CreateEquipmentInput } from "../../api/mdata";
import { useToast } from "../Toast";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { FormField } from "../forms/FormField";
import { FieldSet } from "../forms/FieldSet";
import { userFacingApiError } from "../../lib/api-error-message";

const EQUIPMENT_TYPES = [
  "DryVan",
  "Reefer",
  "Flatbed",
  "Tanker",
  "Container",
  "Chassis",
  "StepDeck",
  "Lowboy",
  "Conestoga",
  "RGN",
  "Other",
] as const;

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated?: (equipmentId: string) => void;
};

const inputClass = "min-h-12 w-full rounded-sm border border-gray-300 px-2 text-xs";

const EMPTY = {
  equipment_number: "",
  vin: "",
  equipment_type: "DryVan" as CreateEquipmentInput["equipment_type"],
  make: "",
  model: "",
  year: "",
  notes: "",
};

/**
 * Create trailer modal for /fleet roster.
 * Wires to POST /api/v1/mdata/equipment. Scopes via currently_leased_to_company_id
 * so the new trailer appears in the selected company's roster.
 */
export function CreateTrailerModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [draft, setDraft] = useState(EMPTY);

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const resetAndClose = () => {
    setDraft(EMPTY);
    onClose();
  };

  const createMutation = useMutation({
    mutationFn: () => {
      const yearRaw = draft.year.trim();
      const year = yearRaw ? Number(yearRaw) : undefined;
      return createEquipment({
        equipment_number: draft.equipment_number.trim(),
        vin: draft.vin.trim() || undefined,
        equipment_type: draft.equipment_type,
        make: draft.make.trim() || undefined,
        model: draft.model.trim() || undefined,
        year: year != null && Number.isFinite(year) ? year : undefined,
        notes: draft.notes.trim() || undefined,
        currently_leased_to_company_id: operatingCompanyId,
      });
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["maintenance", "fleet-table"] });
      pushToast("Trailer created", "success");
      onCreated?.(String(created.id));
      resetAndClose();
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to create trailer"), "error"),
  });

  const canSubmit = Boolean(draft.equipment_number.trim() && draft.equipment_type) && !createMutation.isPending;

  return (
    <Modal variant="drawer" open={open} title="Create Trailer" onClose={resetAndClose} modalKind="fleet-create-trailer" sizePreset="md">
      <form
        data-testid="fleet-create-trailer-form"
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) createMutation.mutate();
        }}
      >
        <FieldSet title="Identity">
          <FormField label="Equipment Number" name="equipment_number">
            <input
              id="equipment_number"
              data-testid="fleet-create-trailer-number"
              className={inputClass}
              value={draft.equipment_number}
              onChange={(e) => set("equipment_number", e.target.value)}
              required
              autoFocus
            />
          </FormField>
          <FormField label="Type" name="equipment_type">
            <select
              id="equipment_type"
              data-testid="fleet-create-trailer-type"
              className={inputClass}
              value={draft.equipment_type}
              onChange={(e) => set("equipment_type", e.target.value as CreateEquipmentInput["equipment_type"])}
              required
            >
              {EQUIPMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === "DryVan" ? "Dry Van" : t === "StepDeck" ? "Step Deck" : t}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="VIN" name="vin">
            <input id="vin" className={inputClass} value={draft.vin} onChange={(e) => set("vin", e.target.value)} />
          </FormField>
          <FormField label="Year" name="year">
            <input
              id="year"
              type="number"
              min={1980}
              max={2100}
              className={inputClass}
              value={draft.year}
              onChange={(e) => set("year", e.target.value)}
            />
          </FormField>
          <FormField label="Make" name="make">
            <input id="make" className={inputClass} value={draft.make} onChange={(e) => set("make", e.target.value)} />
          </FormField>
          <FormField label="Model" name="model">
            <input id="model" className={inputClass} value={draft.model} onChange={(e) => set("model", e.target.value)} />
          </FormField>
        </FieldSet>
        <FieldSet title="Notes" columns={1}>
          <FormField label="Notes" name="notes">
            <textarea
              id="notes"
              rows={3}
              className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </FormField>
        </FieldSet>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={resetAndClose}>
            Cancel
          </Button>
          <Button type="submit" data-testid="fleet-create-trailer-submit" loading={createMutation.isPending} disabled={!canSubmit}>
            + Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}
