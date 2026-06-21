import { useEffect, useState } from "react";
import { ApiError } from "../../../api/client";
import {
  createDotViolationType,
  deactivateDotViolationType,
  updateDotViolationType,
  type DotBasicCategory,
  type DotViolationTypeRow,
} from "../../../api/catalogs-safety";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

type Props = {
  open: boolean;
  companyId: string;
  row: DotViolationTypeRow | null;
  onClose: () => void;
  onSaved: () => void;
};

const VIOLATION_CODE_REGEX = /^[A-Z0-9][A-Z0-9.-]*$/;

const CATEGORY_OPTIONS: { value: DotBasicCategory; label: string }[] = [
  { value: "unsafe_driving", label: "Unsafe Driving" },
  { value: "hours_of_service", label: "Hours of Service" },
  { value: "driver_fitness", label: "Driver Fitness" },
  { value: "controlled_substances", label: "Controlled Substances/Alcohol" },
  { value: "vehicle_maintenance", label: "Vehicle Maintenance" },
  { value: "crash_indicator", label: "Crash Indicator" },
];

type FormState = {
  violation_code: string;
  display_name: string;
  description: string;
  basic_category: DotBasicCategory | "";
  severity_weight: string;
  is_oos: boolean;
  is_active: boolean;
  sort_order: string;
};

function toInitial(row: DotViolationTypeRow | null): FormState {
  return {
    violation_code: row?.violation_code ?? "",
    display_name: row?.display_name ?? "",
    description: row?.description ?? "",
    basic_category: row?.basic_category ?? "",
    severity_weight: row?.severity_weight != null ? String(row.severity_weight) : "",
    is_oos: row?.is_oos ?? false,
    is_active: row?.is_active ?? true,
    sort_order: String(row?.sort_order ?? 0),
  };
}

export function DotViolationTypeModal({ open, companyId, row, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(toInitial(null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(toInitial(row));
    setErrors({});
    setSubmitError("");
  }, [open, row]);

  const isEdit = Boolean(row);

  function validate() {
    const next: Record<string, string> = {};
    if (!VIOLATION_CODE_REGEX.test(form.violation_code.trim())) {
      next.violation_code = "Use letters, numbers, dots, and dashes (e.g. 392.2A).";
    }
    if (!form.display_name.trim()) next.display_name = "Display name is required.";
    if (form.severity_weight.trim()) {
      const weight = Number(form.severity_weight);
      if (!Number.isInteger(weight) || weight < 1 || weight > 10) next.severity_weight = "Severity must be 1–10.";
    }
    if (!form.sort_order.trim() || Number.isNaN(Number(form.sort_order))) next.sort_order = "Sort order is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setIsSaving(true);
    setSubmitError("");
    try {
      const payload = {
        violation_code: form.violation_code.trim(),
        display_name: form.display_name.trim(),
        description: form.description.trim() || null,
        basic_category: form.basic_category === "" ? null : form.basic_category,
        severity_weight: form.severity_weight.trim() ? Number(form.severity_weight) : null,
        is_oos: form.is_oos,
        is_active: form.is_active,
        sort_order: Number(form.sort_order),
      };
      if (row) {
        await updateDotViolationType(companyId, row.id, payload);
      } else {
        await createDotViolationType(companyId, payload);
      }
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const data = (error.data as Record<string, unknown>) ?? {};
        setSubmitError(String(data.error ?? data.message ?? error.message));
      } else {
        setSubmitError("Failed to save DOT Violation Type.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function deactivate() {
    if (!row) return;
    setIsSaving(true);
    setSubmitError("");
    try {
      await deactivateDotViolationType(companyId, row.id);
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const data = (error.data as Record<string, unknown>) ?? {};
        setSubmitError(String(data.error ?? data.message ?? error.message));
      } else {
        setSubmitError("Failed to deactivate DOT Violation Type.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit DOT Violation Type" : "Create DOT Violation Type"}>
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-gray-600">
          Violation Code
          <input value={form.violation_code} onChange={(event) => setForm((v) => ({ ...v, violation_code: event.target.value.toUpperCase() }))} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" placeholder="392.2A" />
          {errors.violation_code ? <div className="mt-1 text-[11px] text-red-700">{errors.violation_code}</div> : null}
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Display Name
          <input value={form.display_name} onChange={(event) => setForm((v) => ({ ...v, display_name: event.target.value }))} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" />
          {errors.display_name ? <div className="mt-1 text-[11px] text-red-700">{errors.display_name}</div> : null}
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          BASIC Category
          <SelectCombobox value={form.basic_category} onChange={(event) => setForm((v) => ({ ...v, basic_category: event.target.value as DotBasicCategory | "" }))} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm">
            <option value="">— None —</option>
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectCombobox>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs font-semibold text-gray-600">
            Severity Weight (1–10)
            <input type="number" min={1} max={10} step={1} value={form.severity_weight} onChange={(event) => setForm((v) => ({ ...v, severity_weight: event.target.value }))} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" placeholder="optional" />
            {errors.severity_weight ? <div className="mt-1 text-[11px] text-red-700">{errors.severity_weight}</div> : null}
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            Sort Order
            <input type="number" value={form.sort_order} onChange={(event) => setForm((v) => ({ ...v, sort_order: event.target.value }))} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" />
            {errors.sort_order ? <div className="mt-1 text-[11px] text-red-700">{errors.sort_order}</div> : null}
          </label>
        </div>

        <label className="block text-xs font-semibold text-gray-600">
          Description
          <textarea value={form.description} onChange={(event) => setForm((v) => ({ ...v, description: event.target.value }))} rows={3} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" placeholder="Optional description" />
        </label>

        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={form.is_oos} onChange={(event) => setForm((v) => ({ ...v, is_oos: event.target.checked }))} />
          Out-of-Service eligible
        </label>

        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={form.is_active} onChange={(event) => setForm((v) => ({ ...v, is_active: event.target.checked }))} />
          Active
        </label>

        {submitError ? <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800">{submitError}</div> : null}

        <div className="flex items-center justify-between">
          <div>
            {isEdit ? (
              <Button type="button" variant="secondary" disabled={isSaving || !row?.is_active} onClick={() => void deactivate()}>
                Deactivate
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={isSaving}>
              {isEdit ? "Save Changes" : "Create"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
