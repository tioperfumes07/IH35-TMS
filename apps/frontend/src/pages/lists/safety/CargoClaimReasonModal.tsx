import { useEffect, useState } from "react";
import { ApiError } from "../../../api/client";
import {
  createCargoClaimReason,
  deactivateCargoClaimReason,
  updateCargoClaimReason,
  type CargoClaimCategory,
  type CargoClaimReasonRow,
} from "../../../api/catalogs-safety";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { CODE_REGEX } from "./shared";

type Props = {
  open: boolean;
  companyId: string;
  row: CargoClaimReasonRow | null;
  onClose: () => void;
  onSaved: () => void;
};

const CATEGORY_OPTIONS: { value: CargoClaimCategory; label: string }[] = [
  { value: "damage", label: "Damage" },
  { value: "shortage", label: "Shortage" },
  { value: "loss", label: "Loss" },
  { value: "delay", label: "Delay" },
  { value: "temperature", label: "Temperature" },
  { value: "contamination", label: "Contamination" },
  { value: "theft", label: "Theft" },
  { value: "concealed_damage", label: "Concealed Damage" },
  { value: "other", label: "Other" },
];

type FormState = {
  reason_code: string;
  display_name: string;
  description: string;
  claim_category: CargoClaimCategory | "";
  is_active: boolean;
  sort_order: string;
};

function toInitial(row: CargoClaimReasonRow | null): FormState {
  return {
    reason_code: row?.reason_code ?? "",
    display_name: row?.display_name ?? "",
    description: row?.description ?? "",
    claim_category: row?.claim_category ?? "",
    is_active: row?.is_active ?? true,
    sort_order: String(row?.sort_order ?? 0),
  };
}

export function CargoClaimReasonModal({ open, companyId, row, onClose, onSaved }: Props) {
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
    if (!CODE_REGEX.test(form.reason_code.trim())) next.reason_code = "Use uppercase letters, numbers, and dashes only.";
    if (!form.display_name.trim()) next.display_name = "Display name is required.";
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
        reason_code: form.reason_code.trim(),
        display_name: form.display_name.trim(),
        description: form.description.trim() || null,
        claim_category: form.claim_category === "" ? null : form.claim_category,
        is_active: form.is_active,
        sort_order: Number(form.sort_order),
      };
      if (row) {
        await updateCargoClaimReason(companyId, row.id, payload);
      } else {
        await createCargoClaimReason(companyId, payload);
      }
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const data = (error.data as Record<string, unknown>) ?? {};
        setSubmitError(String(data.error ?? data.message ?? error.message));
      } else {
        setSubmitError("Failed to save Cargo Claim Reason.");
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
      await deactivateCargoClaimReason(companyId, row.id);
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const data = (error.data as Record<string, unknown>) ?? {};
        setSubmitError(String(data.error ?? data.message ?? error.message));
      } else {
        setSubmitError("Failed to deactivate Cargo Claim Reason.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit Cargo Claim Reason" : "Create Cargo Claim Reason"}>
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-gray-600">
          Reason Code
          <input value={form.reason_code} onChange={(event) => setForm((v) => ({ ...v, reason_code: event.target.value.toUpperCase() }))} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" placeholder="WATER-DAMAGE" />
          {errors.reason_code ? <div className="mt-1 text-[11px] text-red-700">{errors.reason_code}</div> : null}
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Display Name
          <input value={form.display_name} onChange={(event) => setForm((v) => ({ ...v, display_name: event.target.value }))} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" />
          {errors.display_name ? <div className="mt-1 text-[11px] text-red-700">{errors.display_name}</div> : null}
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs font-semibold text-gray-600">
            Claim Category
            <SelectCombobox value={form.claim_category} onChange={(event) => setForm((v) => ({ ...v, claim_category: event.target.value as CargoClaimCategory | "" }))} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm">
              <option value="">— None —</option>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectCombobox>
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
