import { useEffect, useState } from "react";
import { ApiError } from "../../../api/client";
import { createCivilFineType, deactivateCivilFineType, updateCivilFineType, type CivilFineTypeRow } from "../../../api/catalogs-safety";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { CODE_REGEX } from "./shared";

type Props = {
  open: boolean;
  companyId: string;
  row: CivilFineTypeRow | null;
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  code: string;
  display_name: string;
  description: string;
  sort_order: number;
  is_active: boolean;
};

export function CivilFineTypeModal({ open, companyId, row, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>({
    code: "",
    display_name: "",
    description: "",
    sort_order: 0,
    is_active: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      code: row?.code ?? "",
      display_name: row?.display_name ?? "",
      description: row?.description ?? "",
      sort_order: row?.sort_order ?? 0,
      is_active: row?.is_active ?? true,
    });
    setErrors({});
    setSubmitError("");
  }, [open, row]);

  const isEdit = Boolean(row);

  function validate() {
    const next: Record<string, string> = {};
    if (!CODE_REGEX.test(form.code.trim())) next.code = "Use uppercase letters, numbers, and dashes only.";
    if (!form.display_name.trim()) next.display_name = "Display Name is required.";
    if (!Number.isInteger(form.sort_order) || form.sort_order < 0) next.sort_order = "Sort Order must be 0 or greater.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setIsSaving(true);
    setSubmitError("");
    try {
      const payload = {
        code: form.code.trim(),
        display_name: form.display_name.trim(),
        description: form.description.trim() || null,
        sort_order: form.sort_order,
        metadata: row?.metadata ?? {},
        is_active: form.is_active,
      };
      if (row) {
        await updateCivilFineType(companyId, row.id, payload);
      } else {
        await createCivilFineType(companyId, payload);
      }
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const data = (error.data as Record<string, unknown>) ?? {};
        setSubmitError(String(data.error ?? data.message ?? error.message));
      } else {
        setSubmitError("Failed to save Civil Fine Type.");
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
      await deactivateCivilFineType(companyId, row.id);
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const data = (error.data as Record<string, unknown>) ?? {};
        setSubmitError(String(data.error ?? data.message ?? error.message));
      } else {
        setSubmitError("Failed to deactivate Civil Fine Type.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit Civil Fine Type" : "Create Civil Fine Type"}>
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-gray-600">
          Code
          <input value={form.code} onChange={(event) => setForm((v) => ({ ...v, code: event.target.value.toUpperCase() }))} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" placeholder="DOT-FINE" />
          {errors.code ? <div className="mt-1 text-[11px] text-red-700">{errors.code}</div> : null}
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Display Name
          <input value={form.display_name} onChange={(event) => setForm((v) => ({ ...v, display_name: event.target.value }))} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" />
          {errors.display_name ? <div className="mt-1 text-[11px] text-red-700">{errors.display_name}</div> : null}
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Description
          <textarea value={form.description} onChange={(event) => setForm((v) => ({ ...v, description: event.target.value }))} rows={3} className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm" />
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Sort Order
          <input type="number" min={0} step={1} value={form.sort_order} onChange={(event) => setForm((v) => ({ ...v, sort_order: Number(event.target.value || 0) }))} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" />
          {errors.sort_order ? <div className="mt-1 text-[11px] text-red-700">{errors.sort_order}</div> : null}
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
