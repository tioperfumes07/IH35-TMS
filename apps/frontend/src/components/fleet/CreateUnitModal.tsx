import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUnit } from "../../api/mdata";
import { listMyCompanies, type MyCompany } from "../../api/org";
import { useToast } from "../Toast";
import { ParityDrawer } from "../parity/ParityDrawer";
import { Button } from "../Button";
import { Combobox } from "../Combobox";
import { FormField } from "../forms/FormField";
import { FieldSet } from "../forms/FieldSet";
import { userFacingApiError } from "../../lib/api-error-message";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated?: (unitId: string, displayName: string) => void;
};

const inputClass = "min-h-12 w-full rounded-sm border border-gray-300 px-2 text-xs";

function companyPickerLabel(c: MyCompany): string {
  const name = (c.short_name ?? c.legal_name ?? "").trim();
  return name ? `${c.code} · ${name}` : c.code;
}

const EMPTY = {
  unit_number: "",
  vin: "",
  make: "",
  model: "",
  year: "",
  license_plate: "",
  license_state: "",
  notes: "",
  owner_company_id: "",
  currently_leased_to_company_id: "",
};

/**
 * Create truck/unit modal for /fleet roster.
 * Wires to POST /api/v1/mdata/units. Scopes the new unit to the selected operating
 * company via currently_leased_to_company_id so it appears in the roster tenant filter.
 */
export function CreateUnitModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const initialDraft = useMemo(
    () => ({ ...EMPTY, currently_leased_to_company_id: operatingCompanyId }),
    [operatingCompanyId]
  );
  const [draft, setDraft] = useState(initialDraft);

  const set = (key: keyof typeof EMPTY, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const resetAndClose = () => {
    setDraft(initialDraft);
    onClose();
  };

  // Owner/Leased pickers: units are NOT locked to a single owner (unlike trailers, LST-F27) — any
  // of TRANSP/TRK/USMCA may own a unit, so both fields are real, editable Comboboxes. Leased To
  // defaults to the currently-selected operating company (existing behavior preserved); Owner Company
  // is left blank by default and the backend's own resolveAssetCompanyIds falls back to TRK when
  // omitted, so leaving it unset here changes nothing for operators who don't touch the field.
  const companiesQuery = useQuery({
    queryKey: ["org", "me-companies", "create-unit"],
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
      return createUnit({
        unit_number: draft.unit_number.trim(),
        vin: draft.vin.trim(),
        make: draft.make.trim() || undefined,
        model: draft.model.trim() || undefined,
        year: year != null && Number.isFinite(year) ? year : undefined,
        license_plate: draft.license_plate.trim() || undefined,
        license_state: draft.license_state.trim() || undefined,
        notes: draft.notes.trim() || undefined,
        owner_company_id: draft.owner_company_id || undefined,
        currently_leased_to_company_id: draft.currently_leased_to_company_id || operatingCompanyId,
      });
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["maintenance", "fleet-table"] });
      pushToast("Unit created", "success");
      onCreated?.(String(created.id), draft.unit_number.trim());
      resetAndClose();
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to create unit"), "error"),
  });

  const canSubmit = Boolean(draft.unit_number.trim() && draft.vin.trim()) && !createMutation.isPending;

  return (
    <ParityDrawer
      open={open}
      title="Create Unit"
      onClose={resetAndClose}
      stackAboveModal
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={resetAndClose}>
            Cancel
          </Button>
          <Button form="fleet-create-unit-form" type="submit" data-testid="fleet-create-unit-submit" loading={createMutation.isPending} disabled={!canSubmit}>
            + Create
          </Button>
        </div>
      }
    >
      <form
        id="fleet-create-unit-form"
        data-testid="fleet-create-unit-form"
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          // INLINE-CREATE-NESTED-FORM: React still bubbles across the Modal portal into Book Load's
          // outer <form> — without stopPropagation the wizard submits (native GET / silent close).
          e.stopPropagation();
          if (canSubmit) createMutation.mutate();
        }}
      >
        <FieldSet title="Identity">
          <FormField label="Unit Number" name="unit_number">
            <input
              id="unit_number"
              data-testid="fleet-create-unit-number"
              className={inputClass}
              value={draft.unit_number}
              onChange={(e) => set("unit_number", e.target.value)}
              required
              autoFocus
            />
          </FormField>
          <FormField label="VIN" name="vin">
            <input
              id="vin"
              data-testid="fleet-create-unit-vin"
              className={inputClass}
              value={draft.vin}
              onChange={(e) => set("vin", e.target.value)}
              required
            />
          </FormField>
          <FormField label="Make" name="make">
            <input id="make" className={inputClass} value={draft.make} onChange={(e) => set("make", e.target.value)} />
          </FormField>
          <FormField label="Model" name="model">
            <input id="model" className={inputClass} value={draft.model} onChange={(e) => set("model", e.target.value)} />
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
          <FormField label="License Plate" name="license_plate">
            <input
              id="license_plate"
              className={inputClass}
              value={draft.license_plate}
              onChange={(e) => set("license_plate", e.target.value)}
            />
          </FormField>
          <FormField label="License State" name="license_state">
            <input
              id="license_state"
              className={inputClass}
              value={draft.license_state}
              onChange={(e) => set("license_state", e.target.value)}
            />
          </FormField>
          <FormField label="Owner Company" name="owner_company_id">
            <div data-testid="fleet-create-unit-owner_company_id">
              <Combobox
                options={companyOptions}
                value={draft.owner_company_id || null}
                onChange={(v) => set("owner_company_id", v ?? "")}
                placeholder="Defaults to TRK"
                loading={companiesQuery.isLoading}
                allowClear
                dataField="owner_company_id"
              />
            </div>
          </FormField>
          <FormField label="Leased To Company" name="currently_leased_to_company_id">
            <div data-testid="fleet-create-unit-currently_leased_to_company_id">
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
