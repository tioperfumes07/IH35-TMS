import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createEquipment, type CreateEquipmentInput } from "../../api/mdata";
import { listMyCompanies, type MyCompany } from "../../api/org";
import { useToast } from "../Toast";
import { ParityDrawer } from "../parity/ParityDrawer";
import { Button } from "../Button";
import { Combobox } from "../Combobox";
import { FormField } from "../forms/FormField";
import { FieldSet } from "../forms/FieldSet";
import { userFacingApiError } from "../../lib/api-error-message";

function companyPickerLabel(c: MyCompany): string {
  const name = (c.short_name ?? c.legal_name ?? "").trim();
  return name ? `${c.code} · ${name}` : c.code;
}

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

export function equipmentTypesForPickerKind(equipmentKind?: "trailer" | "chassis") {
  if (equipmentKind === "chassis") return ["Chassis"] as const;
  if (equipmentKind === "trailer") return EQUIPMENT_TYPES.filter((type) => type !== "Chassis");
  return EQUIPMENT_TYPES;
}

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated?: (equipmentId: string, displayName: string) => void;
  /** Constrain nested picker create so the created row remains visible after roster reload. */
  equipmentKind?: "trailer" | "chassis";
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
  currently_leased_to_company_id: "",
};

/**
 * Create trailer modal for /fleet roster.
 * Wires to POST /api/v1/mdata/equipment. Scopes via currently_leased_to_company_id
 * so the new trailer appears in the selected company's roster.
 */
export function CreateTrailerModal({ open, operatingCompanyId, onClose, onCreated, equipmentKind }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const initialDraft = useMemo(
    () => ({ ...EMPTY, currently_leased_to_company_id: operatingCompanyId }),
    [operatingCompanyId]
  );
  const [draft, setDraft] = useState(initialDraft);
  const allowedTypes = useMemo(() => equipmentTypesForPickerKind(equipmentKind), [equipmentKind]);

  useEffect(() => {
    if (!open || !equipmentKind) return;
    setDraft((current) => ({
      ...current,
      equipment_type: equipmentKind === "chassis" ? "Chassis" : current.equipment_type === "Chassis" ? "DryVan" : current.equipment_type,
    }));
  }, [equipmentKind, open]);

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const resetAndClose = () => {
    setDraft(initialDraft);
    onClose();
  };

  // Leased To Company only — trailer ownership is locked to TRK for every row (LST-F27 owner
  // ruling: "trucking is the only owner of the equipment"), so there is deliberately no Owner
  // Company picker here, unlike CreateUnitModal. Leased To defaults to the currently-selected
  // operating company (existing behavior preserved) but is now visible and editable.
  const companiesQuery = useQuery({
    queryKey: ["org", "me-companies", "create-trailer"],
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
        currently_leased_to_company_id: draft.currently_leased_to_company_id || operatingCompanyId,
      });
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["maintenance", "fleet-table"] });
      pushToast("Trailer created", "success");
      onCreated?.(String(created.id), draft.equipment_number.trim());
      resetAndClose();
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to create trailer"), "error"),
  });

  const canSubmit = Boolean(draft.equipment_number.trim() && draft.equipment_type) && !createMutation.isPending;

  return (
    <ParityDrawer
      open={open}
      title="Create Trailer"
      onClose={resetAndClose}
      stackAboveModal
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={resetAndClose}>
            Cancel
          </Button>
          <Button form="fleet-create-trailer-form" type="submit" data-testid="fleet-create-trailer-submit" loading={createMutation.isPending} disabled={!canSubmit}>
            + Create
          </Button>
        </div>
      }
    >
      <form
        id="fleet-create-trailer-form"
        data-testid="fleet-create-trailer-form"
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
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
              {allowedTypes.map((t) => (
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
          <FormField label="Leased To Company" name="currently_leased_to_company_id">
            <div data-testid="fleet-create-trailer-currently_leased_to_company_id">
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
      </form>
    </ParityDrawer>
  );
}
