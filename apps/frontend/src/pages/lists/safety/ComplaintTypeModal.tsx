import { useEffect, useState } from "react";
import { ApiError } from "../../../api/client";
import {
  createComplaintType,
  deactivateComplaintType,
  updateComplaintType,
  type ComplaintSeverity,
  type ComplaintTypeRow,
} from "../../../api/catalogs-safety";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { CODE_REGEX } from "./shared";

type Props = {
  open: boolean;
  companyId: string;
  row: ComplaintTypeRow | null;
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  type_code: string;
  type_name: string;
  default_severity: ComplaintSeverity;
  is_active: boolean;
};

const SEVERITY_OPTIONS: { value: ComplaintSeverity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

export function ComplaintTypeModal({ open, companyId, row, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>({
    type_code: "",
    type_name: "",
    default_severity: "medium",
    is_active: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      type_code: row?.type_code ?? "",
      type_name: row?.type_name ?? "",
      default_severity: row?.default_severity ?? "medium",
      is_active: row?.is_active ?? true,
    });
    setErrors({});
    setSubmitError("");
  }, [open, row]);

  const isEdit = Boolean(row);

  function validate() {
    const next: Record<string, string> = {};
    if (!CODE_REGEX.test(form.type_code.trim())) next.type_code = "Use uppercase letters, numbers, and dashes only.";
    if (!form.type_name.trim()) next.type_name = "Type Name is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setIsSaving(true);
    setSubmitError("");
    try {
      const payload = {
        type_code: form.type_code.trim(),
        type_name: form.type_name.trim(),
        default_severity: form.default_severity,
        is_active: form.is_active,
      };
      if (row) {
        await updateComplaintType(companyId, row.id, payload);
      } else {
        await createComplaintType(companyId, payload);
      }
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const data = (error.data as Record<string, unknown>) ?? {};
        setSubmitError(String(data.error ?? data.message ?? error.message));
      } else {
        setSubmitError("Failed to save Complaint Type.");
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
      await deactivateComplaintType(companyId, row.id);
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const data = (error.data as Record<string, unknown>) ?? {};
        setSubmitError(String(data.error ?? data.message ?? error.message));
      } else {
        setSubmitError("Failed to deactivate Complaint Type.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit Complaint Type" : "Create Complaint Type"}>
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-gray-600">
          Type Code
          <input value={form.type_code} onChange={(event) => setForm((v) => ({ ...v, type_code: event.target.value.toUpperCase() }))} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" placeholder="SERVICE-QUALITY" />
          {errors.type_code ? <div className="mt-1 text-[11px] text-red-700">{errors.type_code}</div> : null}
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Type Name
          <input value={form.type_name} onChange={(event) => setForm((v) => ({ ...v, type_name: event.target.value }))} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" />
          {errors.type_name ? <div className="mt-1 text-[11px] text-red-700">{errors.type_name}</div> : null}
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Default Severity
          <SelectCombobox value={form.default_severity} onChange={(event) => setForm((v) => ({ ...v, default_severity: event.target.value as ComplaintSeverity }))} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm">
            {SEVERITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectCombobox>
        </label>

        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" checked={form.is_active} onChange={(event) => setForm((v) => ({ ...v, is_active: event.target.checked }))} />
          Active
        </label>

        {submitError ? <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800">{submitError}</div> : null}

        <div className="flex items-center justify-between">
          <div>
            {isEdit ? (
              <Button type="button" variant="secondary" disabled={isSaving} onClick={() => void deactivate()}>
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
