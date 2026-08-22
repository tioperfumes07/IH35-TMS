/**
 * LISTS-F5967 — Maintenance Parts Catalog create modal, wired to the already-built
 * useCreateMaintPart hook + POST /api/v1/catalogs/maintenance/parts-master (both existed,
 * unused by any UI). mdata.maintenance_parts is fully provisioned on prod
 * (db/migrations/202606281030_maintenance_parts_catalog.sql) with exactly the shape this form
 * submits — no schema/migration work needed, this closes the last mile: a create surface.
 */
import { useState } from "react";
import { userFacingApiError } from "../../lib/api-error-message";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { useCreateMaintPart } from "../../hooks/useMaintenancePartsCatalog";

const CATEGORIES = [
  "engine", "transmission", "brake", "tire", "suspension",
  "electrical", "fuel_system", "cooling", "exhaust", "cabin",
  "reefer", "body", "fluid", "filter", "other",
] as const;

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: () => void;
};

type FormState = {
  sku: string;
  part_name: string;
  manufacturer: string;
  model_compatibility: string;
  category: (typeof CATEGORIES)[number];
  sub_category: string;
  typical_unit_cost: string;
  barcode_upc: string;
};

const EMPTY: FormState = {
  sku: "",
  part_name: "",
  manufacturer: "",
  model_compatibility: "",
  category: "engine",
  sub_category: "",
  typical_unit_cost: "",
  barcode_upc: "",
};

export function CreateMaintPartModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const createMutation = useCreateMaintPart(operatingCompanyId);

  function validate() {
    const next: Record<string, string> = {};
    if (!form.sku.trim()) next.sku = "SKU is required.";
    if (!form.part_name.trim()) next.part_name = "Part Name is required.";
    if (!form.manufacturer.trim()) next.manufacturer = "Manufacturer is required.";
    const cost = form.typical_unit_cost.trim();
    if (cost && (!/^\d+(\.\d{1,2})?$/.test(cost) || Number(cost) < 0)) {
      next.typical_unit_cost = "Enter a non-negative dollar amount.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setSubmitError("");
    try {
      await createMutation.mutateAsync({
        operating_company_id: operatingCompanyId,
        sku: form.sku.trim(),
        part_name: form.part_name.trim(),
        manufacturer: form.manufacturer.trim(),
        model_compatibility: form.model_compatibility
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        category: form.category,
        sub_category: form.sub_category.trim() || null,
        typical_unit_cost_cents: form.typical_unit_cost.trim() ? Math.round(Number(form.typical_unit_cost.trim()) * 100) : 0,
        barcode_upc: form.barcode_upc.trim() || null,
        is_active: true,
      });
      setForm(EMPTY);
      onCreated();
      onClose();
    } catch (error) {
      setSubmitError(userFacingApiError(error, "Create failed"));
    }
  }

  function handleClose() {
    setForm(EMPTY);
    setErrors({});
    setSubmitError("");
    onClose();
  }

  return (
    <Modal variant="drawer" open={open} onClose={handleClose} title="New Maintenance Part">
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-gray-600">
          SKU
          <input
            value={form.sku}
            onChange={(e) => setForm((v) => ({ ...v, sku: e.target.value }))}
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
          />
          {errors.sku ? <div className="mt-1 text-[11px] text-red-700">{errors.sku}</div> : null}
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Part Name
          <input
            value={form.part_name}
            onChange={(e) => setForm((v) => ({ ...v, part_name: e.target.value }))}
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
          />
          {errors.part_name ? <div className="mt-1 text-[11px] text-red-700">{errors.part_name}</div> : null}
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Manufacturer
          <input
            value={form.manufacturer}
            onChange={(e) => setForm((v) => ({ ...v, manufacturer: e.target.value }))}
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
            placeholder="e.g. Detroit Diesel"
          />
          {errors.manufacturer ? <div className="mt-1 text-[11px] text-red-700">{errors.manufacturer}</div> : null}
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Category
          <SelectCombobox
            value={form.category}
            onChange={(e) => setForm((v) => ({ ...v, category: e.target.value as FormState["category"] }))}
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, " ")}
              </option>
            ))}
          </SelectCombobox>
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Sub-category (optional)
          <input
            value={form.sub_category}
            onChange={(e) => setForm((v) => ({ ...v, sub_category: e.target.value }))}
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
          />
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Compatible Models (comma-separated, optional)
          <input
            value={form.model_compatibility}
            onChange={(e) => setForm((v) => ({ ...v, model_compatibility: e.target.value }))}
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
            placeholder="e.g. Cascadia, T680"
          />
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Typical Unit Cost (USD, optional)
          <input
            value={form.typical_unit_cost}
            onChange={(e) => setForm((v) => ({ ...v, typical_unit_cost: e.target.value }))}
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
            placeholder="0.00"
          />
          {errors.typical_unit_cost ? <div className="mt-1 text-[11px] text-red-700">{errors.typical_unit_cost}</div> : null}
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Barcode / UPC (optional)
          <input
            value={form.barcode_upc}
            onChange={(e) => setForm((v) => ({ ...v, barcode_upc: e.target.value }))}
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
          />
        </label>

        {submitError ? <div className="rounded-sm border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800">{submitError}</div> : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={createMutation.isPending}>
            Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}
