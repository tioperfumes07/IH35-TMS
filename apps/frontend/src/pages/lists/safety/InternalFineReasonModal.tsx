import { useEffect, useState } from "react";
import { ApiError } from "../../../api/client";
import { createInternalFineReason, deactivateInternalFineReason, updateInternalFineReason, type InternalFineReasonRow } from "../../../api/catalogs-safety";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { CODE_REGEX } from "./shared";

type Props = {
  open: boolean;
  companyId: string;
  row: InternalFineReasonRow | null;
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  reason_code: string;
  reason_name: string;
  default_amount_dollars: string;
  is_active: boolean;
};

export function InternalFineReasonModal({ open, companyId, row, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>({
    reason_code: "",
    reason_name: "",
    default_amount_dollars: "0.00",
    is_active: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      reason_code: row?.reason_code ?? "",
      reason_name: row?.reason_name ?? "",
      default_amount_dollars: row ? (Number(row.default_amount || 0) / 100).toFixed(2) : "0.00",
      is_active: row?.is_active ?? true,
    });
    setErrors({});
    setSubmitError("");
  }, [open, row]);

  const isEdit = Boolean(row);

  function validate() {
    const next: Record<string, string> = {};
    if (!CODE_REGEX.test(form.reason_code.trim())) next.reason_code = "Use uppercase letters, numbers, and dashes only.";
    if (!form.reason_name.trim()) next.reason_name = "Reason name is required.";
    const dollars = Number(form.default_amount_dollars);
    if (!Number.isFinite(dollars) || dollars <= 0) next.default_amount_dollars = "Default Amount must be greater than 0.";
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
        reason_name: form.reason_name.trim(),
        default_amount: Math.round(Number(form.default_amount_dollars) * 100),
        is_active: form.is_active,
      };
      if (row) {
        await updateInternalFineReason(companyId, row.id, payload);
      } else {
        await createInternalFineReason(companyId, payload);
      }
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const data = (error.data as Record<string, unknown>) ?? {};
        setSubmitError(String(data.error ?? data.message ?? error.message));
      } else {
        setSubmitError("Failed to save Internal Fine Reason.");
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
      await deactivateInternalFineReason(companyId, row.id);
      onSaved();
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const data = (error.data as Record<string, unknown>) ?? {};
        setSubmitError(String(data.error ?? data.message ?? error.message));
      } else {
        setSubmitError("Failed to deactivate Internal Fine Reason.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit Internal Fine Reason" : "New Internal Fine Reason"}>
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-gray-600">
          Reason Code
          <input
            value={form.reason_code}
            onChange={(event) => setForm((v) => ({ ...v, reason_code: event.target.value.toUpperCase() }))}
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
            placeholder="LATE-DELIVERY"
          />
          {errors.reason_code ? <div className="mt-1 text-[11px] text-red-700">{errors.reason_code}</div> : null}
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Reason Name
          <input value={form.reason_name} onChange={(event) => setForm((v) => ({ ...v, reason_name: event.target.value }))} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" />
          {errors.reason_name ? <div className="mt-1 text-[11px] text-red-700">{errors.reason_name}</div> : null}
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Default Amount ($)
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.default_amount_dollars}
            onChange={(event) => setForm((v) => ({ ...v, default_amount_dollars: event.target.value }))}
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
          />
          {errors.default_amount_dollars ? <div className="mt-1 text-[11px] text-red-700">{errors.default_amount_dollars}</div> : null}
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
